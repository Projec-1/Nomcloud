import {
  authenticate,
  errorResponse,
  HttpError,
  json,
  UUID_RE,
} from '../_shared/payments/access.ts'

function currentDateInTimeZone(timeZone: string): string {
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

function monthlyFeeForClass(name: string): number {
  const formMatch = name.match(/form\s*([1-4])/i) ?? name.match(/^\s*f\s*([1-4])\b/i)
  if (formMatch) return 20
  const classMatch = name.match(/(?:class|grade)\s*(\d{1,2})/i)
  if (!classMatch) throw new HttpError(400, `Cannot determine the monthly fee for class "${name}".`)
  const classNumber = Number(classMatch[1])
  if (classNumber >= 1 && classNumber <= 4) return 10
  if (classNumber >= 5 && classNumber <= 8) return 15
  if (classNumber >= 9 && classNumber <= 12) return 20
  throw new HttpError(400, `Cannot determine the monthly fee for class "${name}".`)
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

  try {
    const clients = await authenticate(request)
    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'A JSON request body is required')
    }

    const { school_id: schoolId, student_ids: studentIds } = body as {
      school_id?: unknown
      student_ids?: unknown
    }
    if (typeof schoolId !== 'string' || !UUID_RE.test(schoolId)) {
      throw new HttpError(400, 'A valid school_id is required')
    }
    if (
      !Array.isArray(studentIds) ||
      studentIds.length === 0 ||
      studentIds.length > 100 ||
      studentIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))
    ) {
      throw new HttpError(400, 'One or more valid student_ids are required')
    }
    const uniqueStudentIds = Array.from(new Set(studentIds as string[]))
    if (uniqueStudentIds.length !== studentIds.length) {
      throw new HttpError(400, 'Duplicate student_ids are not allowed')
    }

    const { data: school, error: schoolError } = await clients.adminClient
      .from('schools')
      .select('timezone, currency')
      .eq('id', schoolId)
      .maybeSingle()
    if (schoolError) throw new HttpError(500, schoolError.message)
    if (!school || typeof school.timezone !== 'string' || typeof school.currency !== 'string') {
      throw new HttpError(404, 'School settings were not found')
    }

    const { data: isAdmin, error: adminError } = await clients.callerClient
      .rpc('has_school_admin_role', { p_school_id: schoolId })
    if (adminError) throw new HttpError(500, adminError.message)

    const { data: students, error: studentsError } = await clients.adminClient
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .in('id', uniqueStudentIds)
    if (studentsError) throw new HttpError(500, studentsError.message)
    if ((students ?? []).length !== uniqueStudentIds.length) {
      throw new HttpError(404, 'One or more active students were not found in this school')
    }

    if (isAdmin !== true) {
      for (const studentId of uniqueStudentIds) {
        const { data: isGuardian, error: guardianError } = await clients.callerClient.rpc(
          'is_guardian_of_student',
          { p_school_id: schoolId, p_student_id: studentId },
        )
        if (guardianError) throw new HttpError(500, guardianError.message)
        if (isGuardian !== true) throw new HttpError(403, 'You may only generate fees for your own children')
      }
    }

    const today = currentDateInTimeZone(school.timezone)
    const currentMonth = today.slice(0, 7)
    const monthStart = `${currentMonth}-01`
    const dueDate = lastDayOfMonth(currentMonth)
    const category = `Monthly Fee ${currentMonth}`

    const { data: existingFees, error: existingError } = await clients.adminClient
      .from('fee_records')
      .select('student_id, category, due_date')
      .eq('school_id', schoolId)
      .in('student_id', uniqueStudentIds)
      .or(`category.eq.${category},and(due_date.gte.${monthStart},due_date.lte.${dueDate})`)
    if (existingError) throw new HttpError(500, existingError.message)
    const invoicedStudents = new Set(
      (existingFees ?? [])
        .filter((fee) => fee.category === category || (fee.due_date >= monthStart && fee.due_date <= dueDate))
        .map((fee) => fee.student_id),
    )
    const missingStudentIds = uniqueStudentIds.filter((id) => !invoicedStudents.has(id))
    if (missingStudentIds.length === 0) return json({ created: 0, category })

    const { data: academicYear, error: yearError } = await clients.adminClient
      .from('academic_years')
      .select('id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .maybeSingle()
    if (yearError) throw new HttpError(500, yearError.message)
    if (!academicYear) throw new HttpError(409, 'Set an active academic year before generating monthly fees')

    const { data: term, error: termError } = await clients.adminClient
      .from('terms')
      .select('id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academicYear.id)
      .lte('start_date', today)
      .gte('end_date', today)
      .maybeSingle()
    if (termError) throw new HttpError(500, termError.message)
    if (!term) {
      throw new HttpError(409, 'Create a term covering the current date in the active academic year before generating monthly fees')
    }

    const { data: enrollments, error: enrollmentsError } = await clients.adminClient
      .from('class_enrollments')
      .select('student_id, class_id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academicYear.id)
      .is('left_on', null)
      .in('student_id', missingStudentIds)
    if (enrollmentsError) throw new HttpError(500, enrollmentsError.message)

    const classIds = Array.from(new Set((enrollments ?? []).map((row) => row.class_id)))
    const { data: classes, error: classesError } = classIds.length
      ? await clients.adminClient.from('classes').select('id, name').eq('school_id', schoolId).in('id', classIds)
      : { data: [], error: null }
    if (classesError) throw new HttpError(500, classesError.message)

    const classNameById = new Map((classes ?? []).map((row) => [row.id, row.name]))
    const classByStudent = new Map<string, string>()
    for (const enrollment of enrollments ?? []) {
      const className = classNameById.get(enrollment.class_id)
      if (className) classByStudent.set(enrollment.student_id, className)
    }
    if (missingStudentIds.some((studentId) => !classByStudent.has(studentId))) {
      throw new HttpError(409, 'Every active student needs a current class enrollment before monthly fees can be generated')
    }

    const invoices = missingStudentIds.map((studentId) => {
      const className = classByStudent.get(studentId)
      if (!className) throw new HttpError(409, 'An active student is missing a current class enrollment')
      return {
        school_id: schoolId,
        student_id: studentId,
        term_id: term.id,
        amount: monthlyFeeForClass(className),
        category,
        due_date: dueDate,
        currency: school.currency,
      }
    })
    const { data: created, error: insertError } = await clients.adminClient
      .from('fee_records')
      .upsert(invoices, {
        onConflict: 'school_id,student_id,term_id,category',
        ignoreDuplicates: true,
      })
      .select('id')
    if (insertError) throw new HttpError(500, insertError.message)
    return json({ created: created?.length ?? 0, category })
  } catch (error) {
    return errorResponse(error)
  }
})
