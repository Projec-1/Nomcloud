import { useEffect, useMemo, useState } from 'react'
import { Wallet, FileText, Plus, Pencil, Trash as Trash2, Lock, PaperPlaneTilt as Send } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import EmptyState from '@/components/ui/EmptyState'
import Avatar from '@/components/ui/Avatar'
import ResourceGate from '@/components/ui/ResourceGate'
import { useFinance } from '@/hooks/useFinance'
import { useAcademicStructure } from '@/hooks/useAcademicStructure'
import { fetchSchoolStudents, type RosterStudent } from '@/services/studentService'
import {
  createFeeRecord,
  balanceAfterPayment,
  deleteFeeRecord,
  deletePayment,
  paymentMethodLabel,
  recordPayment,
  updateFeeRecord,
  PAYMENT_METHODS,
  type FeeRecordView,
  type FeeStatus,
  type PaymentMethod,
} from '@/services/financeService'
import Textarea from '@/components/ui/Textarea'
import {
  resolveReminderRecipients,
  sendFeeReminders,
  type ReminderRecipient,
} from '@/services/communicationService'
import type { FieldErrors } from '@/utils/validators'
import { minLength } from '@/utils/validators'
import { formatDate, formatMoney } from '@/utils/format'
import { todayInTimeZone, DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { errorMessage } from '@/utils/errorMessage'
import FeeAnalysisCard from '@/components/dashboard/FeeAnalysisCard'
import PrintButton from '@/components/ui/PrintButton'
import FeePaymentCheckout from '@/components/finance/FeePaymentCheckout'
import PaymentReceiptDocument, { type PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import {
  createSignedPaymentEvidenceUrl,
  removePaymentEvidence,
  schoolLogoUrl,
  uploadPaymentEvidence,
} from '@/services/storageService'
import { printPaymentReceipt } from '@/utils/printPaymentReceipt'

// ---------------------------------------------------------------------------
// Phase 8 batch 6. Real fee_records and fee_payments.
//
// amount_paid IS NOWHERE EDITABLE ON THIS PAGE. It appears in the table and in
// the statement as a READ-ONLY figure, and the only control that changes it is
// "Record Manual Payment", which writes a fee_payments row and lets the trigger
// recalculate. The fee record form has six fields — student, term, category,
// amount, currency, due date — and no seventh. Migration 13 made this
// structural: the column-level UPDATE grant on fee_records omits amount_paid, so
// an edit that tried to include it would fail 42501 rather than corrupt a
// balance.
//
// STATUS IS DERIVED, NOT STORED. fee_records has no status column. The badge and
// the filter both run `deriveFeeStatus` over amount, amount_paid and due_date
// against the SCHOOL'S today. Nothing on this page writes a status.
//
// THE PAYMENT REFERENCE IS REQUIRED, NOT OPTIONAL. The prototype labelled it
// optional and generated `REF<timestamp>` when blank. fee_payments.reference is
// NOT NULL under UNIQUE (school_id, reference), so a generated value would have
// manufactured a fake receipt number for a real payment, and a repeated real one
// would fail. It is now a required field and a duplicate is reported plainly.
//
// THE "SEND PAYMENT REMINDER" FEATURE IS BACK, AND NOW ACTUALLY SENDS.
// Batch 6 removed it because it wrote message threads to the mock store and
// would have reported "12 parents notified" while sending nothing. Batch 7 made
// threads real and confirmed an administrator holds all three writes a
// conversation needs, so it is rebuilt on those.
//
// It reports two things honestly rather than rounding them away: how many
// reminders were actually sent, and which guardians cannot be reached at all
// because they have never accepted their invitation and so have no user account
// to put in a thread.
// ---------------------------------------------------------------------------

const statusTone: Record<FeeStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
  overdue: 'danger',
}

const categories = ['Tuition', 'Transport', 'Meals', 'Uniform', 'Examination', 'Activity', 'Other']

const emptyFeeForm = { studentId: '', termId: '', category: 'Tuition', amount: '', dueDate: '' }

export default function AdminFees() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const { state, records, canManageFinance, schoolId, currency, reload } = useFinance()
  const { state: academicState } = useAcademicStructure()

  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const terms = academicState.status === 'ready' ? academicState.data.terms : []
  const currentTermId = academicState.status === 'ready' ? (academicState.data.term?.id ?? '') : ''

  const [students, setStudents] = useState<RosterStudent[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | FeeStatus>('all')
  const [analysisMode, setAnalysisMode] = useState<'collected' | 'outstanding'>('collected')

  const [feeModalOpen, setFeeModalOpen] = useState(false)
  const [editing, setEditing] = useState<FeeRecordView | null>(null)
  const [feeForm, setFeeForm] = useState(emptyFeeForm)
  const [feeErrors, setFeeErrors] = useState<FieldErrors>({})

  const [payTarget, setPayTarget] = useState<FeeRecordView | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payReference, setPayReference] = useState('')
  const [payDate, setPayDate] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [payErrors, setPayErrors] = useState<FieldErrors>({})

  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderSubject, setReminderSubject] = useState('')
  const [reminderBody, setReminderBody] = useState('')
  const [reminderRecipients, setReminderRecipients] = useState<ReminderRecipient[]>([])
  const [reminderUnreachable, setReminderUnreachable] = useState<string[]>([])
  const [reminderLoading, setReminderLoading] = useState(false)

  const [statementTarget, setStatementTarget] = useState<FeeRecordView | null>(null)
  const [receiptForPrint, setReceiptForPrint] = useState<PaymentReceiptDetails | null>(null)
  const [evidenceLink, setEvidenceLink] = useState<{ paymentId: string; url: string } | null>(null)
  const [deleteFeeTarget, setDeleteFeeTarget] = useState<FeeRecordView | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!receiptForPrint) return
    const clear = () => setReceiptForPrint(null)
    window.addEventListener('afterprint', clear, { once: true })
    const timer = window.setTimeout(() => printPaymentReceipt(receiptForPrint.reference), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', clear)
    }
  }, [receiptForPrint])

  useEffect(() => {
    if (!schoolId || !canManageFinance) return
    let cancelled = false
    fetchSchoolStudents(schoolId)
      .then((rows) => {
        if (!cancelled) setStudents(rows)
      })
      .catch(() => {
        // Non-fatal: the fee table still renders. Only the invoice form needs it.
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, canManageFinance])

  const totals = useMemo(() => {
    const billed = records.reduce((sum, f) => sum + f.amount, 0)
    const collected = records.reduce((sum, f) => sum + f.amountPaid, 0)
    const thisMonth = (() => {
      const prefix = todayInTimeZone(timeZone).slice(0, 7)
      return records.reduce(
        (sum, f) => sum + f.payments.filter((p) => p.paidOn.startsWith(prefix)).reduce((s, p) => s + p.amount, 0),
        0,
      )
    })()
    return {
      billed,
      collected,
      outstanding: billed - collected,
      overdue: records.filter((f) => f.status === 'overdue').length,
      thisMonth,
    }
  }, [records, timeZone])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter((f) => {
      const matchesSearch =
        q === '' || f.studentName.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || f.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [records, search, statusFilter])

  const monthlyAnalysis = useMemo(() => {
    const current = new Date(`${todayInTimeZone(timeZone)}T12:00:00`)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(current.getFullYear(), current.getMonth() - (6 - index), 1)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const collected = records.reduce(
        (sum, fee) => sum + fee.payments.filter((payment) => payment.paidOn.startsWith(key)).reduce((total, payment) => total + payment.amount, 0),
        0,
      )
      const billed = records.reduce((sum, fee) => sum + (fee.dueDate.startsWith(key) ? fee.amount : 0), 0)
      return {
        key,
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        value: analysisMode === 'collected' ? collected : Math.max(0, billed - collected),
        collected,
        billed,
        outstanding: Math.max(0, billed - collected),
      }
    })
  }, [analysisMode, records, timeZone])
  const currentMonthCollected = monthlyAnalysis.at(-1)?.collected ?? 0
  const previousMonthCollected = monthlyAnalysis.at(-2)?.collected ?? 0
  const monthlyChange = previousMonthCollected > 0
    ? ((currentMonthCollected - previousMonthCollected) / previousMonthCollected) * 100
    : null

  const openCreate = () => {
    setEditing(null)
    setFeeForm({
      ...emptyFeeForm,
      studentId: students[0]?.id ?? '',
      termId: currentTermId || (terms[terms.length - 1]?.id ?? ''),
    })
    setFeeErrors({})
    setFeeModalOpen(true)
  }

  const openEdit = (fee: FeeRecordView) => {
    setEditing(fee)
    setFeeForm({
      studentId: fee.studentId,
      termId: fee.termId,
      category: fee.category,
      amount: String(fee.amount),
      dueDate: fee.dueDate,
    })
    setFeeErrors({})
    setFeeModalOpen(true)
  }

  const validateFee = () => {
    const next: FieldErrors = {}
    if (!feeForm.studentId) next.studentId = 'Select a student.'
    // Mirrors fee_records_prevent_paid_student_change, which is the guarantee.
    if (editing && editing.amountPaid > 0 && feeForm.studentId !== editing.studentId) {
      next.studentId = 'This fee already has payments, so its student cannot be changed.'
    }
    if (!feeForm.termId) next.termId = 'Select a term.'
    if (!minLength(feeForm.category, 2)) next.category = 'Select a category.'
    const amount = Number(feeForm.amount)
    // fee_records_amount_check enforces amount > 0 in the database.
    if (!feeForm.amount || Number.isNaN(amount) || amount <= 0) next.amount = 'Enter an amount greater than zero.'
    if (editing && amount < editing.amountPaid) {
      next.amount = `Already paid ${formatMoney(editing.amountPaid, editing.currency, true)}. The amount cannot be lower.`
    }
    if (!feeForm.dueDate) next.dueDate = 'Select a due date.'
    // fee_records_assert_not_created_overdue: a NEW fee cannot be due before
    // today. Editing an existing fee's due date stays allowed (correction path).
    else if (!editing && feeForm.dueDate < todayInTimeZone(timeZone)) {
      next.dueDate = 'A new fee cannot be due before today.'
    }
    setFeeErrors(next)
    return Object.keys(next).length === 0
  }

  const submitFee = async () => {
    if (!validateFee() || !schoolId) return
    setIsSaving(true)
    const input = {
      studentId: feeForm.studentId,
      termId: feeForm.termId,
      category: feeForm.category,
      amount: Number(feeForm.amount),
      currency: editing?.currency ?? currency,
      dueDate: feeForm.dueDate,
      // No amount_paid. See the header.
    }
    try {
      if (editing) {
        await updateFeeRecord(schoolId, editing.id, input)
        showToast({ type: 'success', title: 'Fee updated' })
      } else {
        await createFeeRecord(schoolId, input)
        showToast({ type: 'success', title: 'Fee created', description: 'The invoice starts unpaid until a payment is recorded.' })
      }
      setFeeModalOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: editing ? 'Fee not updated' : 'Fee not created',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const openPay = (fee: FeeRecordView) => {
    setPayTarget(fee)
    setPayAmount(String(fee.balance))
    setPayMethod('cash')
    setPayReference('')
    setPayDate(todayInTimeZone(timeZone))
    setEvidenceFile(null)
    setEvidenceLink(null)
    setPayErrors({})
  }

  const openPaymentEvidence = async (paymentId: string, path: string) => {
    try {
      setEvidenceLink({ paymentId, url: await createSignedPaymentEvidenceUrl(path) })
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Evidence unavailable', description: errorMessage(err) })
    }
  }

  const openPaymentReceipt = (fee: FeeRecordView, payment: FeeRecordView['payments'][number]) => {
    setReceiptForPrint({
      schoolName: school?.name ?? '',
      schoolLogoUrl: schoolLogoUrl(school?.logo_path ?? null),
      schoolAddress: school?.address,
      schoolPhone: school?.phone,
      schoolEmail: school?.email,
      reference: payment.reference,
      studentName: fee.studentName,
      studentAdmissionNo: fee.studentAdmissionNo,
      className: fee.className,
      academicYear: fee.academicYear,
      category: fee.category,
      originalAmount: fee.amount,
      amountPaid: payment.amount,
      remainingBalance: balanceAfterPayment(fee, payment.id),
      currency: payment.currency,
      method: paymentMethodLabel(payment.method),
      paidOn: payment.paidOn,
      paidAt: payment.paidAt,
      providerReference: payment.providerReference,
      status: payment.provider ? 'verified' : 'recorded',
    })
  }

  const validatePayment = () => {
    const next: FieldErrors = {}
    const value = Number(payAmount)
    if (!payAmount || Number.isNaN(value) || value <= 0) next.amount = 'Enter an amount greater than zero.'
    else if (payTarget && value > payTarget.balance) {
      next.amount = `That is more than the outstanding balance of ${formatMoney(payTarget.balance, payTarget.currency, true)}.`
    }
    // Required, not generated. A reference is a real receipt number.
    if (!minLength(payReference.trim(), 2)) next.reference = 'Enter the receipt or transaction reference.'
    if (!payDate) next.paidOn = 'Select the payment date.'
    // fee_payments_assert_not_future_dated (SYSTEM_ISSUES_LIST M9).
    else if (payDate > todayInTimeZone(timeZone)) next.paidOn = 'A payment cannot be dated in the future.'
    setPayErrors(next)
    return Object.keys(next).length === 0
  }

  const submitPayment = async () => {
    if (!payTarget || !schoolId || !validatePayment()) return
    setIsSaving(true)
    let evidencePath: string | undefined
    try {
      if (evidenceFile) evidencePath = await uploadPaymentEvidence(schoolId, evidenceFile)
      await recordPayment(schoolId, {
        feeRecordId: payTarget.id,
        amount: Number(payAmount),
        currency: payTarget.currency,
        method: payMethod,
        reference: payReference.trim(),
        paidOn: payDate,
        evidencePath,
      })
      showToast({
        type: 'success',
        title: 'Payment recorded',
        description: `${formatMoney(Number(payAmount), payTarget.currency, true)} recorded for ${payTarget.category}.`,
      })
      setEvidenceFile(null)
      setPayTarget(null)
      reload()
    } catch (err: unknown) {
      let failure = errorMessage(err)
      if (evidencePath) {
        try {
          await removePaymentEvidence(evidencePath)
        } catch (cleanupError: unknown) {
          failure = `${failure} Evidence upload cleanup also failed: ${errorMessage(cleanupError)}`
        }
      }
      // A duplicate reference lands here with a specific message rather than a
      // raw constraint name.
      showToast({
        type: 'error',
        title: 'Payment not recorded',
        description: failure,
      })
      setPayErrors({ reference: failure })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDeleteFee = async () => {
    if (!deleteFeeTarget || !schoolId) return
    try {
      await deleteFeeRecord(schoolId, deleteFeeTarget.id)
      showToast({ type: 'success', title: 'Fee removed' })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Fee not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteFeeTarget(null)
    }
  }

  const removePayment = async (paymentId: string) => {
    if (!schoolId) return
    try {
      await deletePayment(schoolId, paymentId)
      showToast({ type: 'success', title: 'Payment removed', description: 'The balance has been recalculated.' })
      setStatementTarget(null)
      reload()
    } catch (err: unknown) {
      const message = errorMessage(err)
      showToast({
        type: 'error',
        title: message.startsWith('Payment removed,') ? 'Payment removed with a cleanup issue' : 'Payment not removed',
        description: message,
      })
    }
  }

  // Everyone who still owes something, derived from the same real records the
  // table shows, so a reminder cannot disagree with the balance on screen.
  const openReminder = async () => {
    if (!schoolId) return
    const owing = records.filter((f) => f.status !== 'paid')
    const studentIds = Array.from(new Set(owing.map((f) => f.studentId)))

    setReminderSubject('Outstanding school fees')
    setReminderBody(
      'Dear parent, our records show an outstanding balance for school fees at ' +
        (school?.name ?? 'the school') +
        '. Please settle it at the school office at your earliest convenience. Thank you.',
    )
    setReminderOpen(true)
    setReminderLoading(true)
    try {
      const { recipients, unreachable } = await resolveReminderRecipients(schoolId, studentIds)
      setReminderRecipients(recipients)
      setReminderUnreachable(unreachable)
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Could not work out who to remind',
        description: errorMessage(err),
      })
      setReminderOpen(false)
    } finally {
      setReminderLoading(false)
    }
  }

  const submitReminders = async () => {
    if (!schoolId || reminderRecipients.length === 0) return
    setIsSaving(true)
    try {
      const result = await sendFeeReminders(
        schoolId,
        reminderRecipients,
        reminderSubject.trim() || 'Outstanding school fees',
        reminderBody.trim(),
        reminderUnreachable,
      )
      const parts = [result.sent + ' reminder' + (result.sent === 1 ? '' : 's') + ' sent']
      if (result.failed > 0) parts.push(result.failed + ' failed')
      if (result.unreachable.length > 0) parts.push(result.unreachable.length + ' have no account yet')
      showToast({
        type: result.failed > 0 ? 'error' : 'success',
        title: 'Reminders processed',
        description: parts.join(' \u00b7 '),
      })
      setReminderOpen(false)
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Reminders not sent',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const canCreate = students.length > 0 && terms.length > 0

  return (
    <div>
      <PageHeader
        title="Fees & Payments"
        description="Track balances, collections and outstanding fees across the school."
        actions={
          canManageFinance ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openReminder} icon={<Send className="h-4 w-4" />}>
                Send Payment Reminder
              </Button>
              {canCreate && (
                <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                  New Fee
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <ResourceGate
        state={state}
        empty={{
          icon: Wallet,
          title: 'No fee records yet',
          description: 'Create a fee to begin tracking balances and payments.',
        }}
        deniedHint="Fees and payments are handled by the school office."
      >
        {(all) => (
          <>
            <AdminSectionInsights
              metrics={[
                {
                  label: 'Collected this month',
                  value: formatMoney(totals.thisMonth, currency),
                  change: monthlyChange === null ? undefined : {
                    value: `${Math.abs(monthlyChange).toFixed(1)}% vs previous month`,
                    direction: monthlyChange > 0 ? 'up' : monthlyChange < 0 ? 'down' : 'flat',
                    positive: monthlyChange >= 0,
                  },
                },
                {
                  label: 'Expected this month',
                  value: formatMoney(monthlyAnalysis.at(-1)?.billed ?? 0, currency),
                },
                { label: 'Total collected', value: formatMoney(totals.collected, currency) },
                {
                  label: 'Outstanding',
                  value: formatMoney(totals.outstanding, currency),
                  progress: totals.billed ? (totals.outstanding / totals.billed) * 100 : 0,
                },
                {
                  label: 'Collection rate',
                  value: totals.billed ? `${Math.round((totals.collected / totals.billed) * 100)}%` : '—',
                },
                { label: 'Overdue invoices', value: totals.overdue },
              ]}
              charts={[
                {
                  kind: 'donut',
                  title: 'Paid vs outstanding',
                  segments: [
                    { label: 'Collected', value: totals.collected, tone: 'positive' },
                    { label: 'Outstanding', value: Math.max(0, totals.outstanding), tone: 'warning' },
                  ],
                  formatValue: (value) => formatMoney(value, currency),
                },
              ]}
              insight={`Change compares monthly ${analysisMode === 'collected' ? 'collections' : 'estimated outstanding'} in the selected seven-month analysis.`}
            />

            <FeeAnalysisCard
              currency={currency}
              mode={analysisMode}
              onModeChange={setAnalysisMode}
              months={monthlyAnalysis}
            />

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput value={search} onChange={setSearch} placeholder="Search by student or fee category…" className="sm:w-80" />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="sm:w-48">
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
                <option value="overdue">Overdue</option>
              </Select>
              <span className="text-xs text-graphite">
                {filtered.length} of {all.length}
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Wallet} title="No fee records found" description="Try adjusting your search or filters." />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/5 text-left text-xs text-graphite dark:border-white/10">
                      <th className="px-5 py-3.5 font-medium">Student</th>
                      <th className="px-5 py-3.5 font-medium">Category</th>
                      <th className="px-5 py-3.5 font-medium">Term</th>
                      <th className="px-5 py-3.5 font-medium">Amount</th>
                      <th className="px-5 py-3.5 font-medium">Paid</th>
                      <th className="px-5 py-3.5 font-medium">Due Date</th>
                      <th className="px-5 py-3.5 font-medium">Status</th>
                      <th className="px-5 py-3.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.id} className="border-b border-ink/5 last:border-b-0 dark:border-white/5">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setStatementTarget(f)}
                            className="flex items-center gap-3 text-left hover:opacity-80"
                          >
                            <Avatar name={f.studentName} size="sm" />
                            <p className="font-medium text-ink dark:text-white">{f.studentName}</p>
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-graphite">{f.category}</td>
                        <td className="px-5 py-3.5 text-graphite">{f.termName}</td>
                        <td className="px-5 py-3.5 text-ink dark:text-white">{formatMoney(f.amount, f.currency)}</td>
                        {/* Trigger-maintained. Displayed, never editable. */}
                        <td className="px-5 py-3.5 text-graphite">{formatMoney(f.amountPaid, f.currency)}</td>
                        <td className="px-5 py-3.5 text-graphite">{formatDate(f.dueDate)}</td>
                        <td className="px-5 py-3.5">
                          <Badge tone={statusTone[f.status]}>{f.status}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setStatementTarget(f)}
                              className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                              aria-label={`View payments for ${f.studentName}`}
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(f)}
                              className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                              aria-label={`Edit ${f.category} fee for ${f.studentName}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteFeeTarget(f)}
                              className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                              aria-label={`Delete ${f.category} fee for ${f.studentName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {f.status !== 'paid' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openPay(f)}>
                                  Record Manual Payment
                                </Button>
                                {school?.is_demo && (
                                  <FeePaymentCheckout
                                    fee={f}
                                    school={school}
                                    payerName=""
                                    onPaid={reload}
                                  >
                                    {(openCheckout, pending) => (
                                      <Button size="sm" onClick={openCheckout}>
                                        {pending ? 'Check payment' : 'Test online payment'}
                                      </Button>
                                    )}
                                  </FeePaymentCheckout>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </ResourceGate>

      {/* Fee record form. Six fields. amount_paid is not one of them. */}
      <Modal
        open={feeModalOpen}
        onClose={() => setFeeModalOpen(false)}
        title={editing ? 'Edit Fee' : 'New Fee'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFeeModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitFee} disabled={isSaving}>
              {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Create Fee'}
            </Button>
          </>
        }

      >
        <div className="space-y-4">
          <div>
            <Select
              label="Student"
              required
              value={feeForm.studentId}
              onChange={(e) => setFeeForm({ ...feeForm, studentId: e.target.value })}
              error={feeErrors.studentId}
              // A fee with money against it belongs to its student permanently
              // (SYSTEM_ISSUES_LIST S6); the database refuses the change too.
              disabled={!!editing && editing.amountPaid > 0}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.admissionNo}
                </option>
              ))}
            </Select>
            {editing && editing.amountPaid > 0 && (
              <p className="mt-1.5 text-xs text-graphite">
                Payments have been recorded against this fee, so it stays with this student.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Term"
              required
              value={feeForm.termId}
              onChange={(e) => setFeeForm({ ...feeForm, termId: e.target.value })}
              error={feeErrors.termId}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select
              label="Category"
              required
              value={feeForm.category}
              onChange={(e) => setFeeForm({ ...feeForm, category: e.target.value })}
              error={feeErrors.category}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Amount (${editing?.currency ?? currency})`}
              type="number"
              min={1}
              step="0.01"
              required
              value={feeForm.amount}
              onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })}
              error={feeErrors.amount}
            />
            <Input
              label="Due date"
              type="date"
              required
              min={editing ? undefined : todayInTimeZone(timeZone)}
              value={feeForm.dueDate}
              onChange={(e) => setFeeForm({ ...feeForm, dueDate: e.target.value })}
              error={feeErrors.dueDate}
            />
          </div>
          {editing && (
            <div className="flex items-start gap-2 rounded-xl bg-mist px-3 py-2.5 text-xs text-graphite dark:bg-white/5">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Paid to date is {formatMoney(editing.amountPaid, editing.currency, true)}. It is calculated from
                recorded payments and cannot be edited here. Add or remove a payment to change it.
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* The only control that moves a balance. */}
      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Record Manual Payment"
        description={
          payTarget
            ? `${payTarget.studentName} · ${payTarget.category} · balance ${formatMoney(payTarget.balance, payTarget.currency, true)}. Enter a payment received outside Nom Cloud’s online checkout; never use manual entry to confirm an unverified gateway transaction.`
            : 'Enter a payment received outside Nom Cloud’s online checkout; never use manual entry to confirm an unverified gateway transaction.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitPayment} disabled={isSaving}>
              {isSaving ? 'Recording…' : 'Record Manual Payment'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={`Amount (${payTarget?.currency ?? currency})`}
            type="number"
            min={0.01}
            step="0.01"
            required
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            error={payErrors.amount}
          />
          <Select label="Payment method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Input
            label="Reference"
            required
            value={payReference}
            onChange={(e) => setPayReference(e.target.value)}
            error={payErrors.reference}
            placeholder="Receipt or transaction number"
          />
          <Input
            label="Payment date"
            type="date"
            required
            max={todayInTimeZone(timeZone)}
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            error={payErrors.paidOn}
          />
          <p className="text-xs text-graphite">
            Each reference must be unique within the school. Online checkout transactions are verified and posted automatically.
          </p>
          <Input
            label="Evidence file (optional)"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
            hint="PDF, PNG, JPEG, or WebP · up to 5 MB. Only authorized school finance staff can view it."
          />
        </div>
      </Modal>

      {/* Payment history for one fee. */}
      <Modal open={!!statementTarget} onClose={() => setStatementTarget(null)} title="Payments" size="sm">
        {statementTarget && (
          <div>
            <div className="mb-4 flex justify-end print-hide">
              <PrintButton label="Print fee statement" />
            </div>
            <div className="mb-5 flex items-center gap-3">
              <Avatar name={statementTarget.studentName} />
              <div>
                <p className="font-semibold text-ink dark:text-white">{statementTarget.studentName}</p>
                <p className="text-xs text-graphite">
                  {statementTarget.category} · {statementTarget.termName}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-mist p-4 dark:bg-white/5">
                <p className="text-base font-semibold text-ink dark:text-white">
                  {formatMoney(statementTarget.amount, statementTarget.currency, true)}
                </p>
                <p className="text-xs text-graphite">Billed</p>
              </div>
              <div className="rounded-2xl bg-mist p-4 dark:bg-white/5">
                <p className="text-base font-semibold text-emerald-600">
                  {formatMoney(statementTarget.amountPaid, statementTarget.currency, true)}
                </p>
                <p className="text-xs text-graphite">Paid</p>
              </div>
              <div className="rounded-2xl bg-mist p-4 dark:bg-white/5">
                <p className={`text-base font-semibold ${statementTarget.balance > 0 ? 'text-red-500' : 'text-ink dark:text-white'}`}>
                  {formatMoney(statementTarget.balance, statementTarget.currency, true)}
                </p>
                <p className="text-xs text-graphite">Balance</p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {statementTarget.payments.length === 0 ? (
                <p className="text-sm text-graphite">No payments recorded against this fee yet.</p>
              ) : (
                statementTarget.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-mist px-3 py-2.5 dark:bg-white/5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-white">
                        {formatMoney(p.amount, p.currency, true)}
                      </p>
                      <p className="truncate text-xs text-graphite">
                        {paymentMethodLabel(p.method)} · {p.reference} · {formatDate(p.paidOn)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-graphite">
                        {p.provider ? `Online · ${p.provider}` : 'Manual payment'}
                        {p.paidAt ? ` · ${new Date(p.paidAt).toLocaleString()}` : ''}
                      </p>
                      {p.evidencePath && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <button type="button" onClick={() => void openPaymentEvidence(p.id, p.evidencePath!)} className="font-medium text-brand underline">
                            View evidence
                          </button>
                          {evidenceLink?.paymentId === p.id && <a href={evidenceLink.url} target="_blank" rel="noreferrer" className="text-brand underline">Open file</a>}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openPaymentReceipt(statementTarget, p)}
                        className="min-h-11 rounded-lg px-3 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        Save / print receipt
                      </button>
                      {!p.provider && (
                        <button
                          type="button"
                          onClick={() => removePayment(p.id)}
                          className="min-h-11 min-w-11 rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                          aria-label={`Remove manual payment ${p.reference}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="mt-4 text-xs text-graphite">
              Removing a manual payment recalculates the balance. Verified online payments are retained and cannot be removed from this screen.
            </p>
          </div>
        )}
      </Modal>

      {statementTarget && !receiptForPrint && (
        <article className="print-only print-document" aria-label="Fee statement">
          <header className="mb-6 border-b border-gray-300 pb-4">
            <p className="text-lg font-semibold">{school?.name ?? 'School'}</p>
            <p className="mt-1 text-sm">Fee statement · {new Intl.DateTimeFormat().format(new Date())}</p>
          </header>
          <section className="mb-5">
            <h1 className="text-xl font-semibold">{statementTarget.studentName}</h1>
            <p className="mt-1 text-sm">{statementTarget.category} · {statementTarget.termName}</p>
          </section>
          <dl className="grid grid-cols-3 gap-4 border-y border-gray-300 py-4">
            <div>
              <dt className="text-sm text-gray-600">Billed</dt>
              <dd className="mt-1 font-semibold">{formatMoney(statementTarget.amount, statementTarget.currency, true)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Paid</dt>
              <dd className="mt-1 font-semibold">{formatMoney(statementTarget.amountPaid, statementTarget.currency, true)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Balance</dt>
              <dd className="mt-1 font-semibold">{formatMoney(statementTarget.balance, statementTarget.currency, true)}</dd>
            </div>
          </dl>
          <h2 className="mb-2 mt-6 font-semibold">Payment history</h2>
          {statementTarget.payments.length === 0 ? (
            <p className="text-sm text-gray-600">No payments recorded against this fee.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="border-b p-2 text-left">Date</th>
                  <th className="border-b p-2 text-left">Method</th>
                  <th className="border-b p-2 text-left">Reference</th>
                  <th className="border-b p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statementTarget.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="border-b p-2">{formatDate(payment.paidOn)}</td>
                    <td className="border-b p-2">{paymentMethodLabel(payment.method)}</td>
                    <td className="border-b p-2">{payment.reference}</td>
                    <td className="border-b p-2 text-right">{formatMoney(payment.amount, payment.currency, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}
      {receiptForPrint && <PaymentReceiptDocument details={receiptForPrint} />}

      {/* Real message threads, one per guardian. See the header. */}
      <Modal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        title="Send Payment Reminder"
        description={
          reminderLoading
            ? 'Working out who to remind...'
            : reminderRecipients.length + ' parent(s) can be messaged.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setReminderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitReminders}
              disabled={isSaving || reminderLoading || reminderRecipients.length === 0}
              icon={<Send className="h-4 w-4" />}
            >
              {isSaving ? 'Sending...' : 'Send to ' + reminderRecipients.length}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Subject" value={reminderSubject} onChange={(e) => setReminderSubject(e.target.value)} />
          <Textarea label="Message" rows={5} value={reminderBody} onChange={(e) => setReminderBody(e.target.value)} />
          <p className="text-xs text-graphite">
            Each parent receives their own private conversation. It appears in their Messages inbox.
          </p>
          {reminderUnreachable.length > 0 && (
            <div className="rounded-xl bg-mist px-3 py-2.5 text-xs text-graphite dark:bg-white/5">
              <span className="font-medium text-ink dark:text-white">
                {reminderUnreachable.length} guardian(s) cannot be messaged yet
              </span>{' '}
              because they have not accepted their invitation: {reminderUnreachable.join(', ')}.
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteFeeTarget}
        title={`Delete ${deleteFeeTarget?.category} fee?`}
        description={
          deleteFeeTarget && deleteFeeTarget.payments.length > 0
            ? 'This fee has payments recorded against it and cannot be deleted until they are removed.'
            : 'This fee will be removed from the student record.'
        }
        confirmLabel="Delete"
        danger
        onConfirm={confirmDeleteFee}
        onCancel={() => setDeleteFeeTarget(null)}
      />
    </div>
  )
}
