import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarBlank as CalendarRange, Plus, Trash as Trash2, BookOpen, Users, ArrowUp, ArrowDown } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import { InlineLoader } from '@/components/ui/Loader'
import { useAuth } from '@/context/AuthContext'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { createTimetableSlot, deleteTimetableSlot, fetchManagedTimetable, updateTimetableSlot, type TimetableSlotInput } from '@/services/classService'
import { fetchSchoolClassSubjectAssignments, fetchSchoolTeachers, type ClassSubjectAssignment, type TeacherRow } from '@/services/teacherService'
import type { TimetableSlotView } from '@/services/teacherService'
import { isoWeekdayLabel, TIMETABLE_WEEKDAYS } from '@/utils/schoolCalendar'
import { toError } from '@/utils/errorMessage'
import { useToast } from '@/context/ToastContext'
import { PERIODS } from '@/components/dashboard/TimetableGrid'
import { ensureStandardSchoolSubjects, type SubjectRow } from '@/services/academicService'

type SlotForm = {
  day: string
  period: string
  subjectId: string
  teacherId: string
  startTime: string
  endTime: string
  room: string
}

type BuilderLesson = {
  key: string
  slotId: string | null
  kind: 'lesson' | 'break'
  period: number
  startTime: string
  endTime: string
  subjectId: string
  teacherId: string
  room: string
}

const emptyForm: SlotForm = {
  day: '6',
  period: '1',
  subjectId: '',
  teacherId: '',
  startTime: '08:00',
  endTime: '08:40',
  room: '',
}

export default function AdminTimetables() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const { state, classes, reload: reloadClasses } = useRecordableClasses()
  const [classId, setClassId] = useState('')
  const [slots, setSlots] = useState<TimetableSlotView[]>([])
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [assignments, setAssignments] = useState<ClassSubjectAssignment[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [subjectsError, setSubjectsError] = useState<string | null>(null)
  const [subjectsReloadKey, setSubjectsReloadKey] = useState(0)
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<TimetableSlotView | null>(null)
  const [form, setForm] = useState<SlotForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TimetableSlotView | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderReady, setBuilderReady] = useState(false)
  const [builderClassId, setBuilderClassId] = useState('')
  const [builderDay, setBuilderDay] = useState('6')
  const [builderTargetPeriods, setBuilderTargetPeriods] = useState('6')
  const [builderLessons, setBuilderLessons] = useState<BuilderLesson[]>([])
  const [builderOriginalIds, setBuilderOriginalIds] = useState<string[]>([])
  const [builderOriginalSlots, setBuilderOriginalSlots] = useState<TimetableSlotView[]>([])
  const [builderLoading, setBuilderLoading] = useState(false)
  const [savingDay, setSavingDay] = useState(false)

  const schoolId = school?.id ?? null
  const selectedClass = classes.find((item) => item.id === classId) ?? classes[0] ?? null
  const teacherNames = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.full_name])), [teachers])
  const weekdays = TIMETABLE_WEEKDAYS
  const periodRows = Array.from(
    new Map(
      [...PERIODS, ...slots.map((slot) => ({ period: slot.period, startTime: slot.startTime, endTime: slot.endTime }))]
        .map((period) => [period.period, period]),
    ).values(),
  ).sort((a, b) => a.period - b.period)
  const reload = useCallback(() => setReloadKey((value) => value + 1), [])
  const builderClass = classes.find((item) => item.id === builderClassId) ?? null

  const openBuilder = () => {
    setBuilderClassId(selectedClass?.id ?? '')
    setBuilderDay(String(weekdays[0]))
    setBuilderTargetPeriods('6')
    setBuilderLessons([])
    setBuilderOriginalIds([])
    setBuilderOriginalSlots([])
    setBuilderReady(false)
    setBuilderOpen(true)
  }

  const startDayBuilder = async () => {
    if (!schoolId || !builderClassId) return
    setBuilderLoading(true)
    try {
      const existing = await fetchManagedTimetable(schoolId, builderClassId)
      const daySlots = existing
        .filter((slot) => slot.day === Number(builderDay))
        .sort((a, b) => a.period - b.period)
      setBuilderLessons(daySlots.map((slot) => ({
        key: slot.id,
        slotId: slot.id,
        kind: slot.subjectId ? 'lesson' : 'break',
        period: slot.period,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slot.subjectId ?? '',
        teacherId: slot.teacherId,
        room: slot.room,
      })))
      setBuilderOriginalIds(daySlots.map((slot) => slot.id))
      setBuilderOriginalSlots(daySlots)
      setBuilderReady(true)
    } catch (cause: unknown) {
      showToast({ type: 'error', title: 'Could not load this day', description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBuilderLoading(false)
    }
  }

  const addBuilderEntry = (kind: 'lesson' | 'break') => {
    if (builderLessons.length >= 12) {
      showToast({ type: 'error', title: 'Day is full', description: 'A day can contain up to 12 periods, including breaks.' })
      return
    }
    if (kind === 'lesson' && builderLessons.filter((lesson) => lesson.kind === 'lesson').length >= Number(builderTargetPeriods)) {
      showToast({ type: 'error', title: 'Lesson target reached', description: 'Increase the lesson target or add a break instead.' })
      return
    }
    const previousEnd = builderLessons.at(-1)?.endTime
    const startMinutes = previousEnd
      ? Number(previousEnd.slice(0, 2)) * 60 + Number(previousEnd.slice(3, 5))
      : 8 * 60
    const duration = kind === 'break' ? 20 : 40
    const endMinutes = startMinutes + duration
    const formatTime = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    setBuilderLessons((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${current.length}`,
        slotId: null,
        kind,
        period: current.length + 1,
        startTime: formatTime(startMinutes),
        endTime: formatTime(endMinutes),
        subjectId: '',
        teacherId: '',
        room: '',
      },
    ])
  }

  const updateBuilderLesson = (key: string, changes: Partial<BuilderLesson>) => {
    setBuilderLessons((current) => current.map((lesson) => lesson.key === key ? { ...lesson, ...changes } : lesson))
  }

  const moveBuilderLesson = (index: number, offset: -1 | 1) => {
    setBuilderLessons((current) => {
      const target = index + offset
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((lesson, position) => ({ ...lesson, period: position + 1 }))
    })
  }

  const removeBuilderLesson = (key: string) => {
    setBuilderLessons((current) => current
      .filter((lesson) => lesson.key !== key)
      .map((lesson, index) => ({ ...lesson, period: index + 1 })))
  }

  const saveBuilderDay = async () => {
    if (!schoolId || !builderClass) return
    const sorted = [...builderLessons].sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let index = 0; index < sorted.length; index += 1) {
      const lesson = sorted[index]
      if (!lesson.startTime || !lesson.endTime || lesson.endTime <= lesson.startTime) {
        showToast({ type: 'error', title: `Check period ${lesson.period}`, description: 'The end time must be later than the start time.' })
        return
      }
      if (lesson.kind === 'lesson' && !lesson.subjectId) {
        showToast({ type: 'error', title: `Choose a subject for period ${lesson.period}` })
        return
      }
      if (lesson.kind === 'break' && (lesson.subjectId || lesson.teacherId)) {
        showToast({ type: 'error', title: `Clear the lesson fields for break ${lesson.period}` })
        return
      }
      if (lesson.subjectId && !lesson.teacherId) {
        showToast({ type: 'error', title: `Choose a teacher for period ${lesson.period}` })
        return
      }
      if (!lesson.subjectId && lesson.teacherId) {
        showToast({ type: 'error', title: `Choose a subject for period ${lesson.period}` })
        return
      }
      if (index > 0 && sorted[index - 1].endTime > lesson.startTime) {
        showToast({ type: 'error', title: 'Periods overlap', description: `Periods ${sorted[index - 1].period} and ${lesson.period} overlap.` })
        return
      }
      if (lesson.subjectId && !assignments.some((assignment) =>
        assignment.classId === builderClass.id &&
        assignment.subjectId === lesson.subjectId &&
        assignment.teacherId === lesson.teacherId,
      )) {
        showToast({ type: 'error', title: `Teacher is not assigned to period ${lesson.period}`, description: 'Assign this teacher to the class and subject first.' })
        return
      }
      if (lesson.teacherId && sorted.some((other, otherIndex) =>
        otherIndex !== index &&
        other.teacherId === lesson.teacherId &&
        other.startTime < lesson.endTime &&
        lesson.startTime < other.endTime,
      )) {
        showToast({ type: 'error', title: `Teacher conflict in period ${lesson.period}`, description: 'The same teacher cannot teach overlapping periods.' })
        return
      }
    }

    setSavingDay(true)
    try {
      const hasReorderedSlots = builderLessons.some((lesson) => {
        const original = builderOriginalSlots.find((slot) => slot.id === lesson.slotId)
        return original !== undefined && original.period !== lesson.period
      })
      if (hasReorderedSlots) {
        const temporaryPeriodStart = Math.max(
          100,
          ...builderOriginalSlots.map((slot) => slot.period),
          ...builderLessons.map((lesson) => lesson.period),
        ) + 10
        for (const [index, slot] of builderOriginalSlots.entries()) {
          await updateTimetableSlot(schoolId, slot.id, {
            classId: builderClass.id,
            subjectId: slot.subjectId,
            teacherId: slot.teacherId || null,
            dayOfWeek: Number(builderDay),
            period: temporaryPeriodStart + index,
            startTime: slot.startTime,
            endTime: slot.endTime,
            room: slot.room || null,
          })
        }
      }
      for (const lesson of builderLessons) {
        const input: TimetableSlotInput = {
          classId: builderClass.id,
          subjectId: lesson.kind === 'lesson' ? lesson.subjectId : null,
          teacherId: lesson.kind === 'lesson' ? lesson.teacherId : null,
          dayOfWeek: Number(builderDay),
          period: lesson.period,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          room: lesson.room.trim() || null,
        }
        if (lesson.slotId) await updateTimetableSlot(schoolId, lesson.slotId, input)
        else await createTimetableSlot(schoolId, input)
      }
      const retained = new Set(builderLessons.flatMap((lesson) => lesson.slotId ? [lesson.slotId] : []))
      for (const removedId of builderOriginalIds.filter((id) => !retained.has(id))) {
        await deleteTimetableSlot(schoolId, removedId)
      }
      setClassId(builderClass.id)
      reload()
      showToast({
        type: 'success',
        title: `${isoWeekdayLabel(Number(builderDay) as (typeof weekdays)[number])} saved`,
        description: 'This day is now available in the shared timetable.',
      })
      const currentDayIndex = weekdays.indexOf(Number(builderDay) as (typeof weekdays)[number])
      const nextDay = weekdays[currentDayIndex + 1]
      setBuilderReady(false)
      setBuilderLessons([])
      setBuilderOriginalIds([])
      setBuilderOriginalSlots([])
      if (nextDay) setBuilderDay(String(nextDay))
      else setBuilderOpen(false)
    } catch (cause: unknown) {
      showToast({
        type: 'error',
        title: 'Day was only partly saved',
        description: `${cause instanceof Error ? cause.message : String(cause)} Reload the timetable to check which changes were applied.`,
      })
      setBuilderReady(false)
      setBuilderLessons([])
      setBuilderOriginalIds([])
      setBuilderOriginalSlots([])
      reload()
    } finally {
      setSavingDay(false)
    }
  }

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id)
    if (classId && !classes.some((item) => item.id === classId)) setClassId(classes[0]?.id ?? '')
  }, [classId, classes])

  useEffect(() => {
    let cancelled = false
    if (!schoolId) {
      setLoadingSlots(false)
      setSlots([])
      return
    }
    setLoadingSlots(true)
    setError(null)
    Promise.all([
      classId ? fetchManagedTimetable(schoolId, classId) : Promise.resolve([]),
      fetchSchoolTeachers(schoolId),
      fetchSchoolClassSubjectAssignments(schoolId),
    ])
      .then(([timetable, schoolTeachers, classSubjectAssignments]) => {
        if (cancelled) return
        setSlots(timetable)
        setTeachers(schoolTeachers)
        setAssignments(classSubjectAssignments)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toError(cause))
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, classId, reloadKey])

  useEffect(() => {
    let cancelled = false
    if (!schoolId) {
      setSubjects([])
      setSubjectsLoading(false)
      return
    }
    setSubjectsLoading(true)
    setSubjectsError(null)
    ensureStandardSchoolSubjects(schoolId)
      .then((schoolSubjects) => {
        if (!cancelled) setSubjects(schoolSubjects)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : String(cause)
          setSubjectsError(message)
          showToast({
            type: 'error',
            title: 'Could not load timetable subjects',
            description: message,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setSubjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, showToast, subjectsReloadKey])

  const openNew = (day?: number) => {
    setEditing(null)
    const nextPeriod = Math.max(0, ...slots.filter((slot) => slot.day === (day ?? weekdays[0] ?? 6)).map((slot) => slot.period)) + 1
    setForm({ ...emptyForm, day: String(day ?? weekdays[0] ?? 6), period: String(nextPeriod) })
    setEditorOpen(true)
  }

  const openEdit = (slot: TimetableSlotView) => {
    setEditing(slot)
    setForm({
      day: String(slot.day),
      period: String(slot.period),
      subjectId: slot.subjectId ?? '',
      teacherId: slot.teacherId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room,
    })
    setEditorOpen(true)
  }

  const saveSlot = async () => {
    if (!schoolId || !selectedClass) return
    if (!form.startTime || !form.endTime || form.endTime <= form.startTime || Number(form.period) < 1) {
      showToast({ type: 'error', title: 'Check the lesson details', description: 'Enter a valid period and an end time later than the start time.' })
      return
    }
    if (form.subjectId && !form.teacherId) {
      showToast({ type: 'error', title: 'Assign a teacher', description: 'Lessons need a teacher. Leave both subject and teacher empty for a break.' })
      return
    }
    if (!form.subjectId && form.teacherId) {
      showToast({ type: 'error', title: 'Choose a subject', description: 'A teacher cannot be scheduled without a subject.' })
      return
    }
    const input: TimetableSlotInput = {
      classId: selectedClass.id,
      subjectId: form.subjectId || null,
      teacherId: form.teacherId || null,
      dayOfWeek: Number(form.day),
      period: Number(form.period),
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room.trim() || null,
    }
    setSaving(true)
    try {
      if (editing) await updateTimetableSlot(schoolId, editing.id, input)
      else await createTimetableSlot(schoolId, input)
      showToast({ type: 'success', title: editing ? 'Timetable slot updated' : 'Timetable slot added' })
      setEditorOpen(false)
      reload()
    } catch (cause: unknown) {
      showToast({ type: 'error', title: 'Timetable was not saved', description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!schoolId || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteTimetableSlot(schoolId, deleteTarget.id)
      showToast({ type: 'success', title: 'Timetable slot removed' })
      setDeleteTarget(null)
      reload()
    } catch (cause: unknown) {
      showToast({ type: 'error', title: 'Timetable slot was not removed', description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <section className="mb-6 rounded-xl border border-ink/[0.08] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand"><CalendarRange className="h-4 w-4" /> Academic planning</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white sm:text-3xl">A clear rhythm for every school day.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">Choose a class and build the school week one day at a time.</p>
          </div>
          {selectedClass && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setReviewOpen(true)}>Review timetable</Button>
              <Button onClick={openBuilder} icon={<Plus className="h-4 w-4" />}>Create timetable</Button>
            </div>
          )}
        </div>
      </section>
      <ResourceGate state={state} empty={{ icon: CalendarRange, title: 'No classes available', description: 'Create a class and assign an academic year before adding timetable slots.' }} deniedHint="Timetable management is available to school administrators.">
        {() => selectedClass ? (
          <section className="space-y-5">
            <div className="rounded-xl border border-ink/[0.08] bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white"><Users className="h-4 w-4 text-accent" /> Choose class</h2>
                <span className="text-xs text-graphite">{classes.length} classes</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {classes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={item.id === selectedClass.id}
                    onClick={() => setClassId(item.id)}
                    className={`min-w-36 rounded-xl border px-3.5 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${item.id === selectedClass.id ? 'border-brand/30 bg-brand text-white' : 'border-ink/[0.06] bg-mist text-ink hover:border-brand/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white'}`}
                  >
                    <span className="block text-sm font-semibold">{item.name}</span>
                    <span className={`mt-0.5 block truncate text-[11px] ${item.id === selectedClass.id ? 'text-white/80' : 'text-graphite'}`}>
                      {item.teacherId ? teacherNames.get(item.teacherId) ?? 'Homeroom teacher' : 'No homeroom teacher'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <section className="rounded-xl border border-ink/[0.08] bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-brand/10 p-2 text-brand"><BookOpen className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">Weekly schedule</p>
                  <h2 className="mt-1 text-xl font-semibold text-ink dark:text-white">{selectedClass.name}</h2>
                  <p className="mt-2 text-sm text-graphite">
                    Homeroom teacher: {selectedClass.teacherId ? teacherNames.get(selectedClass.teacherId) ?? 'Not available' : 'Not assigned'}
                    {' · '}{selectedClass.subject.length} subjects · {selectedClass.studentIds.length} students
                  </p>
                </div>
              </div>
            </section>
            {error ? <div role="alert" className="rounded-xl border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-300">{error.message}<Button variant="outline" size="sm" className="ml-3" onClick={reload}>Retry</Button></div> : loadingSlots ? <div className="py-12 text-center"><InlineLoader label="Loading timetable" state="searching" /></div> : slots.length === 0 ? (
              <EmptyState icon={CalendarRange} title="No lessons scheduled" description={`Build the first day for ${selectedClass.name}.`} action={<Button onClick={openBuilder}>Create timetable</Button>} />
            ) : (
              <section className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-white dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.08] px-4 py-4 dark:border-white/10 sm:px-5">
                  <div>
                    <h2 className="font-semibold text-ink dark:text-white">Weekly schedule</h2>
                    <p className="mt-1 text-xs text-graphite">Saturday through Friday · Select any cell to edit or add a period.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openNew()} icon={<Plus className="h-4 w-4" />}>Add period</Button>
                </div>
                <div className="overflow-x-auto p-3 sm:p-5">
                  <table className="w-full min-w-[980px] border-separate border-spacing-1.5 text-left">
                    <thead>
                      <tr>
                        <th className="w-24 px-2 py-2 text-xs font-medium text-graphite">Period</th>
                        {weekdays.map((day, index) => (
                          <th key={day} className={`rounded-xl px-3 py-3 text-sm font-semibold text-ink dark:text-white ${index % 2 ? 'bg-amber-100 dark:bg-amber-400/15' : 'bg-emerald-100 dark:bg-emerald-400/15'}`}>
                            {isoWeekdayLabel(day)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodRows.map((period) => (
                        <tr key={period.period}>
                          <th className="rounded-xl bg-mist px-2 py-3 align-top dark:bg-white/[0.05]">
                            <span className="block text-base font-semibold text-ink dark:text-white">{period.period}</span>
                            <span className="mt-1 block text-[10px] tabular-nums text-graphite">{period.startTime}<br />{period.endTime}</span>
                          </th>
                          {weekdays.map((day) => {
                            const slot = slots.find((item) => item.day === day && item.period === period.period)
                            return (
                              <td key={day} className="align-top">
                                {slot ? (
                                  <div className={`group relative min-h-24 rounded-xl border p-3 ${slot.subject ? 'border-emerald-500/20 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08]' : 'border-amber-500/25 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/[0.1]'}`}>
                                    <button type="button" onClick={() => openEdit(slot)} className="min-h-16 w-full text-left">
                                      <span className="block truncate text-sm font-semibold text-ink dark:text-white">{slot.subject || 'Break'}</span>
                                      <span className="mt-1 block truncate text-xs text-graphite">{slot.subject ? slot.teacherName ?? 'Teacher unassigned' : 'Rest period'}</span>
                                      <span className="mt-1 block text-[10px] tabular-nums"><span className="text-emerald-700 dark:text-emerald-300">{slot.startTime}</span><span className="px-1 text-graphite">–</span><span className="text-red-600 dark:text-red-300">{slot.endTime}</span></span>
                                    </button>
                                    <button type="button" onClick={() => setDeleteTarget(slot)} aria-label={`Remove period ${slot.period}`} className="absolute right-1 top-1 rounded-md p-1 text-red-600 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 dark:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => openNew(day)} className="flex min-h-24 w-full items-center justify-center rounded-xl border border-dashed border-ink/10 text-xs text-graphite/60 hover:border-brand hover:text-brand dark:border-white/10">Add</button>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
        ) : null}
      </ResourceGate>

      <Modal
        open={builderOpen}
        onClose={() => {
          if (savingDay) return
          setBuilderOpen(false)
        }}
        title={builderReady ? `${builderClass?.name ?? 'Class'} · ${isoWeekdayLabel(Number(builderDay) as (typeof weekdays)[number])}` : 'Create timetable'}
        description={builderReady ? 'Build this day, then save it and continue to the next school day.' : 'Choose the class, day and lesson count to begin.'}
        size="xl"
        footer={builderReady ? (
          <>
            <Button variant="ghost" onClick={() => setBuilderOpen(false)} disabled={savingDay}>Cancel</Button>
            <Button onClick={() => void saveBuilderDay()} loading={savingDay}>
              {savingDay ? 'Saving day…' : 'Save day'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setBuilderOpen(false)}>Cancel</Button>
            <Button onClick={() => void startDayBuilder()} loading={builderLoading} disabled={builderLoading || subjectsLoading || subjects.length === 0 || !builderClassId}>
              {builderLoading ? 'Loading…' : 'Build day'}
            </Button>
          </>
        )}
      >
        {!builderReady ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select id="timetable-builder-class" label="Class" value={builderClassId} onChange={(event) => setBuilderClassId(event.target.value)}>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
              <Select id="timetable-builder-day" label="Day" value={builderDay} onChange={(event) => setBuilderDay(event.target.value)}>
                {weekdays.map((day) => <option key={day} value={day}>{isoWeekdayLabel(day)}</option>)}
              </Select>
              <Select id="timetable-builder-period-count" label="Lesson periods" value={builderTargetPeriods} onChange={(event) => setBuilderTargetPeriods(event.target.value)}>
                {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} periods</option>)}
              </Select>
            </div>
            <p className="text-sm text-graphite">Subjects, teachers and times are added as individual lesson rows in the builder.</p>
            {subjectsLoading && <InlineLoader label="Loading school subjects" state="searching" className="text-sm text-graphite" />}
            {subjectsError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/20 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
                <span>{subjectsError}</span>
                <Button variant="outline" size="sm" onClick={() => setSubjectsReloadKey((key) => key + 1)}>Retry</Button>
              </div>
            )}
            <p role="note" className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-xs leading-relaxed text-graphite">
              Saving a day updates the shared timetable immediately. The current database does not support separate drafts or a publish step.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist px-4 py-3 dark:bg-white/[0.04]">
              <p className="text-sm text-ink dark:text-white">
                <span className="font-semibold">{builderLessons.filter((lesson) => lesson.kind === 'lesson').length}</span>
                {' of '}{builderTargetPeriods} lesson periods added
              </p>
              <p className="text-xs text-graphite">{builderLessons.filter((lesson) => lesson.kind === 'break').length} breaks</p>
            </div>

            {builderLessons.map((lesson, index) => (
              <section
                key={lesson.key}
                className={`rounded-xl border p-4 ${lesson.kind === 'lesson' ? 'border-ink/[0.08] dark:border-white/10' : 'border-amber-500/25 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/[0.06]'}`}
                aria-labelledby={`builder-period-${lesson.key}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id={`builder-period-${lesson.key}`} className="font-semibold text-ink dark:text-white">
                    Period {lesson.period}{lesson.kind === 'break' ? ' · Break' : ' · Lesson'}
                  </h3>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveBuilderLesson(index, -1)} disabled={index === 0} aria-label={`Move period ${lesson.period} earlier`} className="flex h-10 w-10 items-center justify-center rounded-lg text-graphite hover:bg-ink/5 disabled:opacity-40 dark:hover:bg-white/10">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => moveBuilderLesson(index, 1)} disabled={index === builderLessons.length - 1} aria-label={`Move period ${lesson.period} later`} className="flex h-10 w-10 items-center justify-center rounded-lg text-graphite hover:bg-ink/5 disabled:opacity-40 dark:hover:bg-white/10">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeBuilderLesson(lesson.key)} aria-label={`Delete period ${lesson.period}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 dark:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Start time" type="time" value={lesson.startTime} onChange={(event) => updateBuilderLesson(lesson.key, { startTime: event.target.value })} />
                  <Input label="End time" type="time" value={lesson.endTime} onChange={(event) => updateBuilderLesson(lesson.key, { endTime: event.target.value })} />
                  {lesson.kind === 'lesson' && (
                    <>
                      <Select
                        id={`builder-subject-${lesson.key}`}
                        label="Subject"
                        value={lesson.subjectId}
                        onChange={(event) => updateBuilderLesson(lesson.key, { subjectId: event.target.value, teacherId: '' })}
                      >
                        <option value="">Choose subject</option>
                        {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                      </Select>
                      <Select
                        id={`builder-teacher-${lesson.key}`}
                        label="Teacher"
                        value={lesson.teacherId}
                        disabled={!lesson.subjectId}
                        onChange={(event) => updateBuilderLesson(lesson.key, { teacherId: event.target.value })}
                      >
                        <option value="">Choose teacher</option>
                        {teachers.filter((teacher) =>
                          teacher.status === 'active' &&
                          (teacher.id === lesson.teacherId || assignments.some((assignment) =>
                            assignment.classId === builderClass?.id &&
                            assignment.subjectId === lesson.subjectId &&
                            assignment.teacherId === teacher.id,
                          )),
                        ).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
                      </Select>
                    </>
                  )}
                </div>
                {lesson.kind === 'lesson' && lesson.subjectId && !assignments.some((assignment) =>
                  assignment.classId === builderClass?.id &&
                  assignment.subjectId === lesson.subjectId &&
                  assignment.teacherId,
                ) && (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    No teacher is assigned to this subject for this class yet. Assign one in Teachers before saving.
                  </p>
                )}
                {lesson.kind === 'break' && <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">Break period · no subject or teacher needed</p>}
              </section>
            ))}

            {builderLessons.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-graphite dark:border-white/15">
                No periods added for this day yet.
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-ink/[0.08] pt-4 dark:border-white/10">
              <Button variant="outline" onClick={() => addBuilderEntry('lesson')} icon={<Plus className="h-4 w-4" />}>Add lesson</Button>
              <Button variant="outline" onClick={() => addBuilderEntry('break')} icon={<Plus className="h-4 w-4" />}>Add break</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'Edit timetable slot' : 'Add timetable slot'} footer={<><Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={() => void saveSlot()} loading={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add lesson'}</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Day" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })}>{weekdays.map((day) => <option key={day} value={day}>{isoWeekdayLabel(day)}</option>)}</Select>
            <Input label="Period number" type="number" min="1" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} />
            <Select label="Subject" value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value, teacherId: '' })}><option value="">Break</option>{selectedClass?.writableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select>
            <Select label="Teacher" value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })} disabled={!form.subjectId}><option value="">Choose teacher</option>{teachers.filter((teacher) => teacher.status === 'active' && (teacher.id === editing?.teacherId || assignments.some((assignment) => assignment.classId === selectedClass?.id && assignment.subjectId === form.subjectId && assignment.teacherId === teacher.id))).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}</Select>
            <Input label="Start time" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
            <Input label="End time" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
          </div>
          <Input label="Room (optional)" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} />
        </div>
      </Modal>
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={`${selectedClass?.name ?? 'Class'} timetable review`}
        footer={<Button onClick={() => setReviewOpen(false)}>Close review</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Ready to review</p>
            <p className="mt-1 text-sm text-graphite">{slots.length} scheduled periods across {new Set(slots.map((slot) => slot.day)).size} school days.</p>
          </div>
          <p className="text-sm leading-relaxed text-graphite">
            The current timetable schema stores the school schedule directly and has no draft or published version field.
            Saving a lesson updates the shared timetable immediately for permitted teacher, parent, and student views.
          </p>
        </div>
      </Modal>
      <ConfirmDialog open={Boolean(deleteTarget)} title="Remove timetable slot?" description="This removes the selected lesson from the school's published timetable." confirmLabel={deleting ? 'Removing…' : 'Remove slot'} danger loading={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
    </div>
  )
}
