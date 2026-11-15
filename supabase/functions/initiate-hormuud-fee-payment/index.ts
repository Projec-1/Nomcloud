import {
  authenticate,
  errorResponse,
  HttpError,
  json,
  UUID_RE,
} from '../_shared/payments/access.ts'

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function localDate(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')
  if (!year || !month || !day) throw new HttpError(500, 'Could not determine the school date')
  return `${year}-${month}-${day}`
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function requiredText(form: FormData, key: string, maximumLength: number): string {
  const value = form.get(key)
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximumLength) {
    throw new HttpError(400, `${key} is required`)
  }
  return value.trim()
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let uploadedEvidencePath: string | null = null
  let insertedSubmissionId: string | null = null
  let adminClient: Awaited<ReturnType<typeof authenticate>>['adminClient'] | null = null

  try {
    const clients = await authenticate(request)
    adminClient = clients.adminClient
    const form = await request.formData()
    const schoolId = requiredText(form, 'school_id', 36)
    const studentId = requiredText(form, 'student_id', 36)
    const feeRecordId = requiredText(form, 'fee_record_id', 36)
    if (![schoolId, studentId, feeRecordId].every((id) => UUID_RE.test(id))) {
      throw new HttpError(400, 'School, student, and fee record ids must be valid UUIDs')
    }

    const payerNumber = requiredText(form, 'payer_number', 32)
    const rawTransactionId = form.get('transaction_id')
    const transactionId = typeof rawTransactionId === 'string' ? rawTransactionId.trim() || null : null
    if (transactionId && transactionId.length > 200) {
      throw new HttpError(400, 'transaction_id must be 200 characters or fewer')
    }
    const rawAmount = requiredText(form, 'amount', 20)
    const requestedAmount = Number(rawAmount)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new HttpError(400, 'amount must be a positive number')
    }

    const [adminCheck, guardianCheck] = await Promise.all([
      clients.callerClient.rpc('has_school_admin_role', { p_school_id: schoolId }),
      clients.callerClient.rpc('is_guardian_of_student', {
        p_school_id: schoolId,
        p_student_id: studentId,
      }),
    ])
    if (adminCheck.error) throw new HttpError(500, adminCheck.error.message)
    if (guardianCheck.error) throw new HttpError(500, guardianCheck.error.message)
    if (adminCheck.data !== true && guardianCheck.data !== true) {
      throw new HttpError(403, 'You may not make a payment for this student')
    }

    const { data: school, error: schoolError } = await clients.adminClient
      .from('schools')
      .select('timezone')
      .eq('id', schoolId)
      .maybeSingle()
    if (schoolError) throw new HttpError(500, schoolError.message)
    if (!school || typeof school.timezone !== 'string') throw new HttpError(404, 'School settings were not found')

    const { data: selectedFee, error: selectedFeeError } = await clients.adminClient
      .from('fee_records')
      .select('id, currency')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('id', feeRecordId)
      .maybeSingle()
    if (selectedFeeError) throw new HttpError(500, selectedFeeError.message)
    if (!selectedFee) throw new HttpError(404, 'Fee record not found for this student')

    const monthEnd = lastDayOfMonth(localDate(school.timezone).slice(0, 7))
    const { data: feeRecords, error: feeRecordsError } = await clients.adminClient
      .from('fee_records')
      .select('id, amount, amount_paid, due_date, currency')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .lte('due_date', monthEnd)
    if (feeRecordsError) throw new HttpError(500, feeRecordsError.message)
    if (!(feeRecords ?? []).some((fee) => fee.id === feeRecordId)) {
      throw new HttpError(409, 'The selected fee is not currently due')
    }
    if ((feeRecords ?? []).some((fee) => fee.currency !== selectedFee.currency)) {
      throw new HttpError(409, 'Outstanding fees use different currencies and cannot be combined')
    }
    const outstanding = (feeRecords ?? []).reduce(
      (sum, fee) => sum + Math.max(0, Number(fee.amount) - Number(fee.amount_paid)),
      0,
    )
    const totalDue = Math.round(outstanding * 100) / 100
    if (totalDue <= 0) throw new HttpError(409, 'There is no outstanding fee balance to pay')
    if (Math.round(requestedAmount * 100) / 100 !== totalDue) {
      throw new HttpError(409, 'The amount has changed. Refresh the fee balance before submitting payment')
    }

    const { data: pendingSubmission, error: pendingError } = await clients.adminClient
      .from('fee_payment_submissions')
      .select('id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('status', 'pending_verification')
      .limit(1)
      .maybeSingle()
    if (pendingError) throw new HttpError(500, pendingError.message)
    if (pendingSubmission) {
      throw new HttpError(409, 'A payment request is already awaiting verification for this student')
    }

    const evidence = form.get('evidence')
    let evidencePath: string | null = null
    if (evidence instanceof File && evidence.size > 0) {
      const extension = MIME_EXTENSIONS[evidence.type]
      if (!extension) throw new HttpError(400, 'Evidence must be a PNG, JPEG, WebP, or PDF file')
      if (evidence.size > MAX_EVIDENCE_BYTES) throw new HttpError(413, 'Evidence file must be 5 MB or smaller')
      evidencePath = `${schoolId}/fee-payments/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await clients.adminClient.storage
        .from('payment-evidence')
        .upload(evidencePath, evidence, { contentType: evidence.type, upsert: false })
      if (uploadError) throw new HttpError(500, uploadError.message)
      uploadedEvidencePath = evidencePath
    } else if (evidence !== null && !(evidence instanceof File)) {
      throw new HttpError(400, 'evidence must be a file')
    }

    const { data: submission, error: submissionError } = await clients.adminClient
      .from('fee_payment_submissions')
      .insert({
        school_id: schoolId,
        student_id: studentId,
        fee_record_id: feeRecordId,
        amount: totalDue,
        currency: selectedFee.currency,
        payer_number: payerNumber,
        transaction_id: transactionId,
        evidence_path: evidencePath,
      })
      .select('id, created_at')
      .single()
    if (submissionError) {
      if (submissionError.code === '23505') {
        throw new HttpError(409, 'This transaction or a payment request is already pending verification')
      }
      throw new HttpError(500, submissionError.message)
    }
    insertedSubmissionId = submission.id

    const { error: eventError } = await clients.adminClient.from('payment_events').insert({
      school_id: schoolId,
      provider: 'hormuud',
      provider_event_id: transactionId ?? submission.id,
      payment_method: 'hormuud_evc',
      event_type: 'fee_payment_initiated',
      amount: totalDue,
      currency: selectedFee.currency,
      fee_record_id: feeRecordId,
      raw_payload: {
        submission_id: submission.id,
        method: 'hormuud_evc',
        payer_number: payerNumber,
        transaction_id: transactionId,
        evidence_path: evidencePath,
      },
      processing_status: 'received',
    })
    if (eventError) throw new HttpError(500, eventError.message)

    return json({
      submission_id: submission.id,
      amount: totalDue,
      status: 'pending_verification',
      created_at: submission.created_at,
    }, 201)
  } catch (error) {
    if (adminClient && insertedSubmissionId) {
      const { error: cleanupError } = await adminClient
        .from('fee_payment_submissions')
        .delete()
        .eq('id', insertedSubmissionId)
      if (cleanupError) {
        return errorResponse(new Error(`Payment request failed and submission cleanup failed: ${cleanupError.message}`))
      }
    }
    if (adminClient && uploadedEvidencePath) {
      const { error: cleanupError } = await adminClient.storage
        .from('payment-evidence')
        .remove([uploadedEvidencePath])
      if (cleanupError) {
        return errorResponse(new Error(`Payment request failed and evidence cleanup failed: ${cleanupError.message}`))
      }
    }
    return errorResponse(error)
  }
})
