import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash as Trash2, ChartBar as BarChart3, Clock, MapPin } from '@phosphor-icons/react'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import { SkeletonRows } from '@/components/ui/Loader'
import type { FieldErrors } from '@/utils/validators'
import { minLength } from '@/utils/validators'
import { formatDate } from '@/utils/format'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { useAcademicStructure } from '@/hooks/useAcademicStructure'
import type { ClassSummary } from '@/services/teacherService'
import {
  createExam,
  deleteExam,
  fetchExams,
  updateExam,
  type ExamView,
} from '@/services/teachingRecordsService'
import { errorMessage } from '@/utils/errorMessage'
import { todayInTimeZone } from '@/utils/schoolCalendar'
import { useAuth } from '@/context/AuthContext'

// ---------------------------------------------------------------------------
// Phase 8 batch 5. Reads and writes real exams.
//
// WHAT THE PROTOTYPE GOT WRONG BEYOND THE DATA SOURCE. Three of its form fields
// could not have been stored as typed:
//
//   subject   a free-text Input; exams.subject_id is a foreign key to subjects
//   term      taken from a mock string; exams.term_id is a NOT NULL foreign key
//   status    derived from "is the date in the past", overwriting a real
//             lifecycle whose CHECK allows scheduled / completed / cancelled
//
// All three are now real selectors over real rows. Status in particular is
// chosen rather than inferred, because "cancelled" is a decision a school makes,
// not something a date can tell you.
//
// SUBJECT-EXACT WRITES, SAME RULE AS GRADES. exams_teacher_insert and
// exams_teacher_update both require teaches_class_subject. The subject selector
// is therefore writableSubjects for the chosen class, which is every subject for
// management and only their own for a teacher.
//
// DELETE IS MANAGEMENT-ONLY. exams has exams_management_delete and no teacher
// DELETE policy, so the delete control is rendered only when canManage is true.
// A teacher reaching it would get zero rows affected and no error.
// ---------------------------------------------------------------------------

const emptyForm = {
  name: '',
  classId: '',
  subjectId: '',
  termId: '',
  date: '',
  startTime: '08:00',
  duration: '90',
  maxScore: '100',
  room: '',
  status: 'scheduled' as ExamView['status'],
}

const statusOptions: ExamView['status'][] = ['scheduled', 'completed', 'cancelled']

export default function AdminExams() {
  const { showToast } = useToast()
  const { school } = useAuth()
  const { state: classState, classes, canManage, schoolId } = useRecordableClasses()
  const { state: academicState } = useAcademicStructure()

  const [classFilter, setClassFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ExamView | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [deleteTarget, setDeleteTarget] = useState<ExamView | null>(null)

  const [exams, setExams] = useState<ExamView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [nonce, setNonce] = useState(0)

  const classIds = useMemo(() => classes.map((c) => c.id), [classes])
  const terms = academicState.status === 'ready' ? academicState.data.terms : []
  const currentTermId = academicState.status === 'ready' ? (academicState.data.term?.id ?? '') : ''

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    if (!schoolId || classIds.length === 0) {
      setExams([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(false)
    fetchExams(schoolId, classIds)
      .then((rows) => {
        if (!cancelled) setExams(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(true)
        showToast({
          type: 'error',
          title: 'Could not load exams',
          description: errorMessage(err),
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, classIds, nonce, showToast])

  const filtered = useMemo(
    () => exams.filter((e) => classFilter === 'all' || e.classId === classFilter),
    [exams, classFilter],
  )

  const assignableClasses = useMemo(() => classes.filter((c) => c.writableSubjects.length > 0), [classes])
  const formClass = classes.find((c) => c.id === form.classId)
  const formSubjects = formClass?.writableSubjects ?? []

  const openAdd = () => {
    const first = assignableClasses[0]
    setEditing(null)
    setForm({
      ...emptyForm,
      classId: first?.id ?? '',
      subjectId: first?.writableSubjects[0]?.id ?? '',
      termId: currentTermId || (terms[terms.length - 1]?.id ?? ''),
    })
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (exam: ExamView) => {
    setEditing(exam)
    setForm({
      name: exam.name,
      classId: exam.classId,
      subjectId: exam.subjectId,
      termId: exam.termId,
      date: exam.examDate,
      startTime: exam.startTime ?? '08:00',
      duration: exam.durationMinutes === null ? '' : String(exam.durationMinutes),
      maxScore: exam.maxScore === null ? '' : String(exam.maxScore),
      room: exam.room ?? '',
      status: exam.status,
    })
    setErrors({})
    setModalOpen(true)
  }

  const validate = () => {
    const next: FieldErrors = {}
    if (!minLength(form.name, 2)) next.name = 'Enter an exam name.'
    if (!form.classId) next.classId = 'Select a class.'
    if (!form.subjectId) next.subjectId = 'Select a subject.'
    if (!form.termId) next.termId = 'Select a term.'
    if (!form.date) next.date = 'Select a date.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate() || !schoolId) return
    setIsSaving(true)

    const payload = {
      classId: form.classId,
      subjectId: form.subjectId,
      termId: form.termId,
      name: form.name,
      examDate: form.date,
      startTime: form.startTime || null,
      // exams_duration_minutes_check requires > 0, and exams_max_score_check
      // requires > 0. Both columns are nullable, so an empty field becomes NULL
      // rather than a zero the constraint would reject.
      durationMinutes: form.duration ? Number(form.duration) : null,
      maxScore: form.maxScore ? Number(form.maxScore) : null,
      status: form.status,
      room: form.room || null,
    }

    try {
      if (editing) {
        await updateExam(schoolId, editing.id, payload)
        showToast({ type: 'success', title: 'Exam updated' })
      } else {
        await createExam(schoolId, payload)
        showToast({ type: 'success', title: 'Exam scheduled', description: `${form.name} was added to the calendar.` })
      }
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: editing ? 'Exam not updated' : 'Exam not scheduled',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !schoolId) return
    try {
      await deleteExam(schoolId, deleteTarget.id)
      showToast({ type: 'success', title: 'Exam removed' })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Exam not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  const canSchedule = assignableClasses.length > 0 && terms.length > 0

  return (
    <div>
      <PageHeader
        title="Exams"
        description="Schedule and manage exams across all classes."
        actions={
          canSchedule ? (
            <Button onClick={openAdd} icon={<Plus className="h-4 w-4" />}>
              Schedule Exam
            </Button>
          ) : undefined
        }
      />

      <ResourceGate
        state={classState}
        empty={{
          icon: BarChart3,
          title: 'No classes yet',
          description: 'Exams are scheduled against a class. Create a class first.',
        }}
        deniedHint="Exam scheduling is available to school staff."
      >
        {(visibleClasses) => (
          <>
            {!isLoading && !loadError && (() => {
              const today = todayInTimeZone(school?.timezone)
              const completed = filtered.filter((exam) => exam.status === 'completed').length
              const scheduled = filtered.filter((exam) => exam.status === 'scheduled').length
              const cancelled = filtered.filter((exam) => exam.status === 'cancelled').length
              const upcoming = filtered.filter((exam) => exam.status === 'scheduled' && exam.examDate >= today).length
              return (
                <AdminSectionInsights
                  metrics={[
                    { label: 'Upcoming exams', value: upcoming },
                    { label: 'Completed', value: completed },
                    {
                      label: 'Completion rate',
                      value: filtered.length ? `${Math.round((completed / filtered.length) * 100)}%` : '—',
                      progress: filtered.length ? (completed / filtered.length) * 100 : 0,
                    },
                  ]}
                  charts={[
                    {
                      kind: 'donut',
                      title: 'Exam status',
                      segments: [
                        { label: 'Completed', value: completed, tone: 'positive' },
                        { label: 'Scheduled', value: scheduled, tone: 'brand' },
                        { label: 'Cancelled', value: cancelled, tone: 'neutral' },
                      ],
                    },
                  ]}
                  insight="Exam scores and pass rates are not available in the current scheduled-exam records."
                />
              )
            })()}
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="mb-6 sm:w-56">
              <option value="all">All Classes</option>
              {visibleClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            {terms.length === 0 && (
              <div className="mb-5 rounded-2xl border border-ink/5 bg-white/60 px-4 py-3 text-xs text-graphite dark:border-white/10 dark:bg-white/[0.03]">
                Exams are recorded against a term. Set up the academic year before scheduling one.
              </div>
            )}

            {isLoading ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <EmptyState icon={BarChart3} title="No exams scheduled" description="Schedule your first exam to see it here." />
            ) : (
              <ExamTable
                exams={filtered}
                classes={visibleClasses}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            )}
          </>
        )}
      </ResourceGate>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Exam' : 'Schedule Exam'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Schedule Exam'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Exam name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
            placeholder="Mathematics — End of Term Exam"
          />
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
            {/* writableSubjects, not the class's full subject list: exams are
                subject-exact for a teacher and class-level for management. */}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Term"
              required
              value={form.termId}
              onChange={(e) => setForm({ ...form, termId: e.target.value })}
              error={errors.termId}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ExamView['status'] })}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} error={errors.date} />
            <Input label="Start time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <Input label="Duration (min)" type="number" min={1} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            <Input label="Max score" type="number" min={1} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Cancel ${deleteTarget?.name}?`}
        description="This exam will be removed from the schedule."
        confirmLabel="Delete Exam"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function ExamTable({
  exams,
  classes,
  canManage,
  onEdit,
  onDelete,
}: {
  exams: ExamView[]
  classes: ClassSummary[]
  canManage: boolean
  onEdit: (exam: ExamView) => void
  onDelete: (exam: ExamView) => void
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink/5 text-left text-xs text-graphite dark:border-white/10">
            <th className="px-5 py-3.5 font-medium">Exam</th>
            <th className="px-5 py-3.5 font-medium">Class</th>
            <th className="px-5 py-3.5 font-medium">Date &amp; Time</th>
            <th className="px-5 py-3.5 font-medium">Room</th>
            <th className="px-5 py-3.5 font-medium">Status</th>
            <th className="px-5 py-3.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => {
            const cls = classes.find((c) => c.id === exam.classId)
            // Editing is subject-exact; deleting is management-only. Neither is
            // offered where the database would refuse it.
            const canEdit = (cls?.writableSubjects ?? []).some((s) => s.id === exam.subjectId)
            return (
              <tr key={exam.id} className="border-b border-ink/5 last:border-b-0 dark:border-white/5">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-ink dark:text-white">{exam.name}</p>
                  <p className="text-xs text-graphite">{exam.subjectName}</p>
                </td>
                <td className="px-5 py-3.5 text-graphite">{cls?.name ?? '—'}</td>
                <td className="px-5 py-3.5 text-graphite">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> {formatDate(exam.examDate)}
                    {exam.startTime ? ` · ${exam.startTime}` : ''}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-graphite">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {exam.room ?? '—'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <Badge tone={exam.status === 'completed' ? 'neutral' : exam.status === 'cancelled' ? 'danger' : 'success'}>
                    {exam.status}
                  </Badge>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1.5">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(exam)}
                        aria-label={`Edit ${exam.name}`}
                        className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onDelete(exam)}
                        aria-label={`Delete ${exam.name}`}
                        className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
