import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, Pencil, Trash as Trash2, Users, MapPin, FileXls as FileSpreadsheet } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import ImportDialog from '@/components/import/ImportDialog'
import { classesImport } from '@/services/import/kinds'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Input from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import SearchInput from '@/components/ui/SearchInput'
import RequestProcessing from '@/components/ui/RequestProcessing'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { useAcademicStructure } from '@/hooks/useAcademicStructure'
import {
  createClass,
  deleteClass,
  updateClass,
} from '@/services/classService'
import { fetchSchoolTeachers, type ClassSummary, type TeacherRow } from '@/services/teacherService'
import { minLength, type FieldErrors } from '@/utils/validators'
import { errorMessage } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Phase 8 batch 8. Real classes and real timetable slots.
//
// TIMETABLE EDITING LIVES HERE AND NOWHERE ELSE. timetable_slots gates INSERT,
// UPDATE and DELETE on can_manage_class, which is management. The teacher screen
// lost its editing controls in this batch for exactly that reason, and this is
// where the capability actually exists.
//
// CAMPUS IS NOT SENT. classes writes gate on
// has_campus_scoped_management(school_id, campus_id), which is the one place
// campus genuinely bites. Locked decision 2 keeps the frontend campus-unaware,
// so a class created here has campus_id NULL, which RLS batch 3 settled is
// visible and manageable by every principal. Assigning a class to a campus
// arrives with campus awareness, not before it.
// ---------------------------------------------------------------------------

const emptyForm = {
  name: '',
  grade: '',
  section: '',
  room: '',
  capacity: '',
  classTeacherId: '',
}

export default function AdminClasses() {
  const { school } = useAuth()
  const { showToast } = useToast()
  // K6: the current year by default; any other year, or all of them, on request.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [yearScope, setYearScope] = useState<string>('active')
  const [search, setSearch] = useState('')
  const { state, classes, schoolId, reload } = useRecordableClasses(yearScope)
  const { state: academicState } = useAcademicStructure()

  const activeYearId = academicState.status === 'ready' ? (academicState.data.activeYear?.id ?? '') : ''
  const years = academicState.status === 'ready' ? academicState.data.years : []

  const [teachers, setTeachers] = useState<TeacherRow[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ClassSummary | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [deleteTarget, setDeleteTarget] = useState<ClassSummary | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!schoolId) return
    fetchSchoolTeachers(schoolId)
      .then((ts) => {
        if (cancelled) return
        setTeachers(ts)
      })
      .catch(() => {
        // Pickers degrade to empty; the class list still renders.
      })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const teacherNames = useMemo(() => new Map(teachers.map((t) => [t.id, t.full_name])), [teachers])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (c: ClassSummary) => {
    setEditing(c)
    setForm({
      name: c.name,
      grade: c.grade,
      section: c.section ?? '',
      room: c.room ?? '',
      capacity: c.capacity === null ? '' : String(c.capacity),
      classTeacherId: c.teacherId ?? '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const validate = () => {
    const next: FieldErrors = {}
    if (!minLength(form.grade, 1)) next.grade = 'Enter a grade.'
    // Only a NEW class needs the active year; an edit keeps the class's own year.
    if (!editing && !activeYearId) next.name = 'Set an active academic year before creating classes.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate() || !schoolId) return
    setIsSaving(true)
    const input = {
      name: editing?.name ?? `Grade ${form.grade.trim()}`,
      grade: form.grade,
      section: editing?.section ?? null,
      room: editing?.room ?? null,
      capacity: editing?.capacity ?? null,
      academicYearId: activeYearId,
      classTeacherId: form.classTeacherId || null,
    }
    try {
      if (editing) {
        await updateClass(schoolId, editing.id, input)
        showToast({ type: 'success', title: 'Class updated' })
      } else {
        await createClass(schoolId, input)
        showToast({ type: 'success', title: 'Class created' })
      }
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: editing ? 'Class not updated' : 'Class not created',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !schoolId) return
    try {
      await deleteClass(schoolId, deleteTarget.id)
      showToast({ type: 'success', title: 'Class removed' })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Class not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Class groups and their homeroom teachers."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)} icon={<FileSpreadsheet className="h-4 w-4" />}>
              Bulk Import
            </Button>
            <Button onClick={openAdd} icon={<Plus className="h-4 w-4" />}>Add Class</Button>
          </div>
        }
      />

      {years.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Select
            aria-label="Academic year"
            value={yearScope}
            onChange={(e) => setYearScope(e.target.value)}
            className="sm:w-64"
          >
            <option value="active">Current year{activeYearId ? '' : ' (none set)'}</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label} · {y.status}
              </option>
            ))}
            <option value="all">All years</option>
          </Select>
          <p className="text-xs text-graphite">
            {yearScope === 'active'
              ? 'Showing the current academic year. Earlier years stay available here.'
              : yearScope === 'all'
                ? 'Showing every academic year, including closed ones.'
                : 'Showing a single academic year. New classes are always created in the current year.'}
          </p>
        </div>
      )}

      <ResourceGate
        state={state}
        empty={{
          icon: BookOpen,
          title: yearScope === 'active' ? 'No classes in the current year yet' : 'No classes in this view',
          description:
            yearScope === 'active'
              ? 'Create your first class for this year to get started.'
              : 'Choose another year above, or return to the current year.',
        }}
        deniedHint="Class records are available to school staff."
      >
        {(rows) => {
          const query = search.trim().toLowerCase()
          const visibleRows = rows.filter((classroom) => {
            const teacherName = classroom.teacherId ? teacherNames.get(classroom.teacherId) ?? '' : ''
            return [
              classroom.name,
              classroom.grade,
              classroom.section ?? '',
              classroom.room ?? '',
              teacherName,
            ].some((value) => value.toLowerCase().includes(query))
          })

          return (
            <div>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search classes, rooms or teachers…"
                  ariaLabel="Search classes, rooms or teachers"
                  className="sm:w-96"
                />
                <p className="text-sm text-graphite" aria-live="polite">
                  {visibleRows.length} {visibleRows.length === 1 ? 'class' : 'classes'}
                </p>
              </div>

              {visibleRows.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No matching classes"
                  description="Try another class name, grade, room or teacher."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleRows.map((c) => {
                    const enrollmentPercent = c.capacity ? Math.min(100, Math.round((c.studentIds.length / c.capacity) * 100)) : null
                    const isFull = c.capacity !== null && c.studentIds.length >= c.capacity

                    return (
                      <article
                        key={c.id}
                        className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus-within:border-brand/40 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-brand/40"
                      >
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand/80 via-brand/35 to-transparent" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="truncate text-base font-semibold tracking-tight text-ink dark:text-white">{c.name}</h2>
                              <span className="inline-flex shrink-0 items-center rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand dark:bg-brand/15">
                                Grade {c.grade}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-graphite">
                              {c.section ? `Section ${c.section}` : 'Class group'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              aria-label={`Edit ${c.name}`}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-graphite transition-colors hover:bg-brand/10 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 dark:hover:bg-brand/15"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(c)}
                              aria-label={`Remove ${c.name}`}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-graphite transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${isFull ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {c.studentIds.length}{c.capacity ? ` / ${c.capacity}` : ''} students
                          </span>
                          {c.capacity !== null && (
                            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isFull ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-ink/5 text-graphite dark:bg-white/10'}`}>
                              {isFull ? 'At capacity' : `${c.capacity - c.studentIds.length} seats open`}
                            </span>
                          )}
                        </div>

                        {enrollmentPercent !== null && (
                          <div className="mt-4" aria-label={`${enrollmentPercent}% of class capacity used`}>
                            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-graphite">
                              <span>Class capacity</span>
                              <span>{enrollmentPercent}%</span>
                            </div>
                            <div
                              className="h-1.5 overflow-hidden rounded-full bg-ink/5 dark:bg-white/10"
                              role="progressbar"
                              aria-valuenow={enrollmentPercent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label="Class capacity used"
                            >
                              <div
                                className={`h-full rounded-full transition-[width] duration-300 ${isFull ? 'bg-amber-500' : 'bg-brand'}`}
                                style={{ width: `${enrollmentPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="mt-5 grid gap-3 border-t border-ink/5 pt-4 text-sm dark:border-white/10">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
                              <MapPin className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="truncate text-graphite">{c.room ?? 'No room assigned'}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300">
                              <BookOpen className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="truncate text-graphite">
                              {c.teacherId ? teacherNames.get(c.teacherId) ?? 'Homeroom assigned' : 'No homeroom teacher'}
                            </span>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }}
      </ResourceGate>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Class' : 'Add Class'}
        footer={
          isSaving ? <RequestProcessing compact title={editing ? 'Updating class' : 'Creating class'} description="Saving your changes securely…" /> :
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Class'}
            </Button>
          </>
        }
      >
        {isSaving ? <RequestProcessing title={editing ? 'Updating class' : 'Creating class'} description="Your class details are being saved securely." /> : <div className="space-y-4">
          <Input
            label="Grade"
            required
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
            error={errors.grade}
            placeholder="e.g. 7 or Kindergarten"
          />
          <Select
            label="Foremaster / homeroom teacher"
            value={form.classTeacherId}
            onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}
          >
            <option value="">None</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
          {!editing && <p className="text-xs text-graphite">The class name will be generated from the selected grade.</p>}
          {!activeYearId && (
            <p className="text-xs text-red-500">
              No active academic year is set. A class belongs to an academic year, so one must exist first.
            </p>
          )}
        </div>}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Remove ${deleteTarget?.name}?`}
        description="Only a class with no attendance, grades, homework, exams or enrolled students (past or present) can be removed."
        confirmLabel="Remove Class"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ImportDialog kind={classesImport} open={bulkOpen} onClose={() => setBulkOpen(false)} onImported={reload} />
    </div>
  )
}
