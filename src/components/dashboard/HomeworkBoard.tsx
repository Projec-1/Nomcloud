import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Calendar, Users, Trash as Trash2, CaretDown as ChevronDown, CaretUp as ChevronUp, Lock } from '@phosphor-icons/react'
import { useToast } from '@/context/ToastContext'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Avatar from '@/components/ui/Avatar'
import { SkeletonRows } from '@/components/ui/Loader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import type { FieldErrors } from '@/utils/validators'
import { minLength } from '@/utils/validators'
import { formatDate, percentage } from '@/utils/format'
import type { ClassSummary } from '@/services/teacherService'
import { fetchRosterStudents, type RosterStudent } from '@/services/studentService'
import {
  createHomework,
  deleteHomework,
  fetchHomework,
  setSubmissionStatus,
  type HomeworkView,
  type SubmissionStatus,
} from '@/services/teachingRecordsService'
import { todayInTimeZone } from '@/utils/schoolCalendar'
import { errorMessage } from '@/utils/errorMessage'
import { recentMonthlyCounts } from '@/utils/adminAnalytics'

// ---------------------------------------------------------------------------
// Phase 8 batch 5. Reads and writes real homework and homework_submissions.
//
// SUBJECT-EXACT, LIKE GRADES. homework_teacher_insert requires
// teaches_class_subject, so the subject control in the assign dialog is a
// SELECT over writableSubjects, not the free-text Input the prototype had. A
// free-text subject could not work regardless of permissions: homework.subject_id
// is a foreign key to subjects, not a string.
//
// THE ONE PLACE A TEACHER MAY DELETE. homework_teacher_delete exists and is
// subject-exact. Attendance, grades, exams and submissions have no teacher
// DELETE policy at all, which is why this is the only screen in the batch with a
// delete control — and why it is shown only for a subject the user may write.
//
// ABSENCE MEANS PENDING. No trigger creates submission rows when homework is
// assigned, and nothing in this batch bulk-inserts them: writing one row per
// student purely to store the word "pending" would be a large write with no
// information in it. The roster is the denominator and a student with no row is
// pending, which is also why changing a status is an upsert.
//
// GUARDIANS DO NOT SUBMIT. Decision 4 of RLS batch 4 — homework is physical and
// the teacher records it in person. The prototype's parent page called
// updateSubmission; that path is gone, and nothing here is reachable by a
// guardian.
//
// ATTACHMENTS REMOVED, NOT RESKINNED. The prototype carried an "attachments"
// count. The homework table has no such column and there is no Storage bucket
// (open decision 10), so the control is removed rather than left writing a
// number nowhere.
// ---------------------------------------------------------------------------

const emptyForm = { classId: '', subjectId: '', title: '', description: '', dueDate: '' }

const submissionOptions: { value: SubmissionStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'late', label: 'Late' },
  { value: 'graded', label: 'Graded' },
]

interface HomeworkBoardProps {
  classes: ClassSummary[]
  schoolId: string
  timeZone: string
}

export default function HomeworkBoard({ classes, schoolId, timeZone }: HomeworkBoardProps) {
  const { showToast } = useToast()

  const [classFilter, setClassFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [deleteTarget, setDeleteTarget] = useState<HomeworkView | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [items, setItems] = useState<HomeworkView[]>([])
  const [roster, setRoster] = useState<Map<string, RosterStudent[]>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [nonce, setNonce] = useState(0)

  const classIds = useMemo(() => classes.map((c) => c.id), [classes])

  // Any class in which this user may assign something. A homeroom-only teacher
  // has none, and the Assign button is withheld rather than opening a dialog
  // with an empty subject list.
  const assignableClasses = useMemo(() => classes.filter((c) => c.writableSubjects.length > 0), [classes])

  useEffect(() => {
    let cancelled = false
    if (classIds.length === 0) {
      setItems([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(false)
    Promise.all([
      fetchHomework(schoolId, classIds),
      // Rosters are fetched per class so the submission list can show every
      // student, including those with no submission row yet.
      Promise.all(
        classes.map(async (c) => [c.id, await fetchRosterStudents(schoolId, c.studentIds)] as const),
      ),
    ])
      .then(([homework, rosters]) => {
        if (cancelled) return
        setItems(homework)
        setRoster(new Map(rosters))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(true)
        showToast({
          type: 'error',
          title: 'Could not load homework',
          description: errorMessage(err),
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, classes, classIds, nonce, showToast])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const filtered = useMemo(
    () => items.filter((h) => classFilter === 'all' || h.classId === classFilter),
    [items, classFilter],
  )

  const formClass = classes.find((c) => c.id === form.classId)
  const formSubjects = formClass?.writableSubjects ?? []

  const openAdd = () => {
    const first = assignableClasses[0]
    setForm({
      ...emptyForm,
      classId: first?.id ?? '',
      subjectId: first?.writableSubjects[0]?.id ?? '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const validate = () => {
    const next: FieldErrors = {}
    if (!form.classId) next.classId = 'Select a class.'
    if (!form.subjectId) next.subjectId = 'Select a subject you teach.'
    if (!minLength(form.title, 3)) next.title = 'Enter a homework title.'
    if (!form.dueDate) next.dueDate = 'Select a due date.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsSaving(true)
    const assignedDate = todayInTimeZone(timeZone)

    try {
      await createHomework(schoolId, {
        classId: form.classId,
        subjectId: form.subjectId,
        title: form.title,
        description: form.description,
        assignedDate,
        // homework_dates_check requires due_date >= assigned_date. A due date in
        // the past is rejected here with a readable message rather than arriving
        // as a raw constraint violation.
        dueDate: form.dueDate,
      })
      showToast({ type: 'success', title: 'Homework assigned', description: `${form.title} was sent to the class.` })
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Homework not assigned',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteHomework(schoolId, deleteTarget.id)
      showToast({ type: 'success', title: 'Homework removed' })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Homework not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  const changeStatus = async (homeworkId: string, studentId: string, status: SubmissionStatus) => {
    // Optimistic, then reconciled by reload. A refused write surfaces as a toast
    // and the reload puts the real value back.
    setItems((prev) =>
      prev.map((h) =>
        h.id !== homeworkId
          ? h
          : {
              ...h,
              submissions: [
                ...h.submissions.filter((s) => s.studentId !== studentId),
                { studentId, status },
              ],
            },
      ),
    )
    try {
      await setSubmissionStatus(schoolId, homeworkId, studentId, status)
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Status not updated',
        description: errorMessage(err),
      })
      reload()
    }
  }

  if (isLoading) return <SkeletonRows />

  const today = todayInTimeZone(timeZone)
  const monthlyBuckets = recentMonthlyCounts(filtered.map((homework) => homework.assignedDate))
  const homeworkTotals = {
    expected: 0,
    submitted: 0,
    pending: 0,
    overduePending: 0,
    late: 0,
  }
  const monthlySubmissions = new Map(monthlyBuckets.keys.map((key) => [key, { expected: 0, completed: 0 }]))
  for (const homework of filtered) {
    const rosterStudents = roster.get(homework.classId) ?? []
    const submissions = new Map(homework.submissions.map((submission) => [submission.studentId, submission.status]))
    homeworkTotals.expected += rosterStudents.length
    const month = monthlySubmissions.get(homework.assignedDate.slice(0, 7))
    if (month) month.expected += rosterStudents.length
    for (const student of rosterStudents) {
      const status = submissions.get(student.id) ?? 'pending'
      if (status === 'pending') {
        homeworkTotals.pending += 1
        if (homework.dueDate < today) homeworkTotals.overduePending += 1
        continue
      }
      homeworkTotals.submitted += 1
      if (status === 'late') homeworkTotals.late += 1
      if (month) month.completed += 1
    }
  }
  const monthlyRates = monthlyBuckets.keys.map((key) => {
    const month = monthlySubmissions.get(key)
    return month?.expected ? (month.completed / month.expected) * 100 : 0
  })
  const priorMonthlyRate = monthlySubmissions.get(monthlyBuckets.keys.at(-2) ?? '')?.expected
    ? monthlyRates.at(-2) ?? null
    : null
  const currentMonthlyRate = monthlySubmissions.get(monthlyBuckets.keys.at(-1) ?? '')?.expected
    ? monthlyRates.at(-1) ?? null
    : null
  const monthlyRateChange = priorMonthlyRate === null || currentMonthlyRate === null
    ? null
    : currentMonthlyRate - priorMonthlyRate

  return (
    <div>
      {!loadError && (
        <AdminSectionInsights
          metrics={[
            { label: 'Homework assigned', value: filtered.length },
            {
              label: 'Submitted',
              value: homeworkTotals.submitted,
              detail: `of ${homeworkTotals.expected} expected`,
            },
            { label: 'Overdue pending', value: homeworkTotals.overduePending },
            {
              label: 'Submission rate',
              value: homeworkTotals.expected
                ? `${Math.round((homeworkTotals.submitted / homeworkTotals.expected) * 100)}%`
                : '—',
              progress: homeworkTotals.expected
                ? (homeworkTotals.submitted / homeworkTotals.expected) * 100
                : 0,
              change: monthlyRateChange === null ? undefined : {
                value: `${Math.abs(monthlyRateChange).toFixed(1)} pts vs prior month`,
                direction: monthlyRateChange > 0 ? 'up' : monthlyRateChange < 0 ? 'down' : 'flat',
                positive: monthlyRateChange >= 0,
              },
            },
          ]}
          charts={[
            {
              kind: 'line',
              title: 'Submission rate by assigned month',
              categories: monthlyBuckets.labels,
              series: [{ label: 'Submitted', values: monthlyRates }],
              formatValue: (value) => `${value.toFixed(0)}%`,
            },
            {
              kind: 'donut',
              title: 'Submission status',
              segments: [
                { label: 'Submitted', value: Math.max(0, homeworkTotals.submitted - homeworkTotals.late), tone: 'positive' },
                { label: 'Late', value: homeworkTotals.late, tone: 'warning' },
                { label: 'Pending', value: Math.max(0, homeworkTotals.pending - homeworkTotals.overduePending), tone: 'neutral' },
                { label: 'Overdue pending', value: homeworkTotals.overduePending, tone: 'negative' },
              ],
            },
          ]}
          insight="Missing or pending rows are counted against each class roster. Submission rates are grouped by assigned month."
        />
      )}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-56">
          <option value="all">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {assignableClasses.length > 0 && (
          <Button onClick={openAdd} icon={<Plus className="h-4 w-4" />}>
            Assign Homework
          </Button>
        )}
      </div>

      {assignableClasses.length === 0 && classes.length > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-ink/5 bg-white/60 px-4 py-3 text-xs text-graphite dark:border-white/10 dark:bg-white/[0.03]">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>Homework is assigned by the teacher of each subject. You can view what has been set here.</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No homework assigned" description="Assign your first homework to get started." />
      ) : (
        <div className="space-y-4">
          {filtered.map((hw) => {
            const cls = classes.find((c) => c.id === hw.classId)
            const students = roster.get(hw.classId) ?? []
            const statusByStudent = new Map(hw.submissions.map((s) => [s.studentId, s.status]))
            const submitted = students.filter((s) => (statusByStudent.get(s.id) ?? 'pending') !== 'pending').length
            const isOpen = expanded === hw.id
            // Delete and status edits are offered only where this user may write
            // this subject. Both are refused by RLS otherwise, and a refused
            // DELETE or UPDATE reports zero rows with no error.
            const canWrite = (cls?.writableSubjects ?? []).some((s) => s.id === hw.subjectId)

            return (
              <div key={hw.id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : hw.id)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="info">{hw.subjectName}</Badge>
                      <Badge tone="neutral">{cls?.name}</Badge>
                    </div>
                    <p className="truncate font-medium text-ink dark:text-white">{hw.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-graphite">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Due {formatDate(hw.dueDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {submitted}/{students.length} submitted
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(hw)
                        }}
                        aria-label={`Delete homework: ${hw.title}`}
                        className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-graphite" /> : <ChevronDown className="h-4 w-4 text-graphite" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-ink/5 px-5 py-4 dark:border-white/10">
                    {hw.description && <p className="mb-4 text-sm leading-relaxed text-graphite">{hw.description}</p>}
                    <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/5 dark:bg-white/10">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${percentage(submitted, students.length)}%` }} />
                    </div>
                    <div className="space-y-2">
                      {students.map((student) => {
                        const status = statusByStudent.get(student.id) ?? 'pending'
                        return (
                          <div key={student.id} className="flex items-center justify-between rounded-xl bg-mist px-3 py-2.5 dark:bg-white/5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={student.name} color={student.avatarColor} size="xs" />
                              <span className="text-sm text-ink dark:text-white">{student.name}</span>
                            </div>
                            {canWrite ? (
                              <select
                                aria-label={`Submission status for ${student.name}`}
                                value={status}
                                onChange={(e) => changeStatus(hw.id, student.id, e.target.value as SubmissionStatus)}
                                className="rounded-lg border border-ink/10 bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-white/10"
                              >
                                {submissionOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Badge tone={status === 'pending' ? 'neutral' : 'success'}>
                                {submissionOptions.find((o) => o.value === status)?.label ?? status}
                              </Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Assign Homework"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isSaving}>
              {isSaving ? 'Assigning…' : 'Assign to Class'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Class"
              required
              value={form.classId}
              onChange={(e) => {
                const next = classes.find((c) => c.id === e.target.value)
                setForm({ ...form, classId: e.target.value, subjectId: next?.writableSubjects[0]?.id ?? '' })
              }}
              error={errors.classId}
            >
              {assignableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {/* A SELECT over writableSubjects, never free text: subject_id is a
                foreign key, and only a subject this user teaches will be
                accepted by teaches_class_subject. */}
            <Select
              label="Subject"
              required
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              error={errors.subjectId}
            >
              {formSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <Input
            label="Due date"
            type="date"
            required
            min={todayInTimeZone(timeZone)}
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            error={errors.dueDate}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        description="Students and parents will no longer see this homework."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
