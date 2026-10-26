import { useCallback, useEffect, useMemo, useState } from 'react'
import { GraduationCap, Plus, Pencil, Trash as Trash2, ShieldSlash as ShieldOff, ShieldCheck, Envelope as Mail, FileXls as FileSpreadsheet } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import ImportDialog from '@/components/import/ImportDialog'
import { teachersImport } from '@/services/import/kinds'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Switch from '@/components/ui/Switch'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Avatar from '@/components/ui/Avatar'
import ResourceGate from '@/components/ui/ResourceGate'
import { deriveResourceState } from '@/lib/resourceState'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import {
  createTeacher,
  deleteTeacher,
  fetchSchoolClassSubjectAssignments,
  fetchSchoolTeachers,
  saveTeacherClassSubjectAssignments,
  type ClassSubjectAssignment,
  updateTeacher,
  type TeacherRow,
} from '@/services/teacherService'
import { fetchSubjects, type SubjectRow } from '@/services/academicService'
import { minLength, type FieldErrors } from '@/utils/validators'
import { fetchTeacherAccess, revokeAccess, restoreAccess, type PersonAccess } from '@/services/accessService'
import { listLiveInvitations, sendInvitation, type InvitationRow } from '@/services/invitationService'
import BulkInviteBar from '@/components/ui/BulkInviteBar'
import { ThinkingOrb } from 'thinking-orbs'
import RequestProcessing from '@/components/ui/RequestProcessing'
import { runBulkInvite, type BulkInviteProgress, type BulkInviteResult } from '@/services/bulkInvite'
import { formatDate } from '@/utils/format'
import { errorMessage, toError } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Phase 8 batch 8. Real teachers.
//
// A TEACHERS ROW IS NOT AN ACCOUNT. Creating one here records a member of
// staff; it does not let them sign in. The link between a teachers row and a
// user is memberships.teacher_id, written by accept_invitation when they redeem
// an invitation. The form says so, because the prototype's silence on this is
// how an administrator ends up wondering why a new teacher cannot log in.
//
// "Classes taught" is derived here rather than stored. The prototype carried a
// classIds array on the teacher; the real relation runs the other way, through
// classes.class_teacher_id and class_subjects.teacher_id — the same OR that
// defines "assigned to teach" everywhere else in this codebase.
// ---------------------------------------------------------------------------

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  staffNo: '',
  primarySubjectId: '',
  status: 'active',
}

export default function AdminTeachers() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const { classes } = useRecordableClasses()

  const schoolId = school?.id ?? null

  const [bulkOpen, setBulkOpen] = useState(false)
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [classSubjectAssignments, setClassSubjectAssignments] = useState<ClassSubjectAssignment[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  const [search, setSearch] = useState('')
  const [expandedSubjectsTeacherId, setExpandedSubjectsTeacherId] = useState<string | null>(null)
  const [expandedClassesTeacherId, setExpandedClassesTeacherId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TeacherRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [assignmentSelection, setAssignmentSelection] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<FieldErrors>({})
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // APP ACCESS IS A SECOND, SEPARATE FACT from teachers.status (S4). It lives on
  // memberships, exists only once an invitation was accepted, and is what every
  // policy resolves through. Both are shown, so neither is mistaken for the
  // other, and taking access away is its own action.
  const [access, setAccess] = useState<Map<string, PersonAccess>>(new Map())
  // Live invitations by email, so a row can say "Invited" instead of "No login"
  // and the button can offer a resend rather than a duplicate.
  const [invitations, setInvitations] = useState<Map<string, InvitationRow>>(new Map())
  const [inviting, setInviting] = useState<string | null>(null)
  // Bulk invitation — the same paced loop the Guardians page uses.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkInviteProgress | null>(null)
  const [bulkResults, setBulkResults] = useState<BulkInviteResult[] | null>(null)
  const [accessTarget, setAccessTarget] = useState<{ teacher: TeacherRow; current: PersonAccess } | null>(null)
  const [alsoRevoke, setAlsoRevoke] = useState(true)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    if (!schoolId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    Promise.all([
      fetchSchoolTeachers(schoolId),
      fetchSubjects(schoolId),
      fetchTeacherAccess(schoolId),
      listLiveInvitations(schoolId),
      fetchSchoolClassSubjectAssignments(schoolId),
    ])
      .then(([rows, subs, accessMap, live, assignments]) => {
        if (cancelled) return
        setTeachers(rows)
        setSubjects(subs)
        setAccess(accessMap)
        setClassSubjectAssignments(assignments)
        setInvitations(new Map(live.filter((i) => i.role === 'teacher').map((i) => [i.email.toLowerCase(), i])))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, nonce])

  const state = deriveResourceState<TeacherRow[]>({
    isLoading,
    canAccess: schoolId !== null,
    error,
    data: teachers,
    retry: reload,
  })

  const subjectNames = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])

  // The same OR that defines "assigned to teach" everywhere else: homeroom on
  // classes, or a subject link on class_subjects. Both arms are already carried
  // by the class summaries.
  const classesByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const c of classes) {
      if (c.teacherId) map.set(c.teacherId, new Set([...(map.get(c.teacherId) ?? []), c.name]))
    }
    for (const assignment of classSubjectAssignments) {
      if (!assignment.teacherId) continue
      const name = classes.find((item) => item.id === assignment.classId)?.name
      if (!name) continue
      const names = map.get(assignment.teacherId) ?? new Set<string>()
      names.add(name)
      map.set(assignment.teacherId, names)
    }
    return new Map(Array.from(map, ([teacherId, names]) => [teacherId, Array.from(names)]))
  }, [classSubjectAssignments, classes])

  const assignedSubjectsByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const assignment of classSubjectAssignments) {
      if (!assignment.teacherId) continue
      const name = subjectNames.get(assignment.subjectId)
      if (!name) continue
      const names = map.get(assignment.teacherId) ?? new Set<string>()
      names.add(name)
      map.set(assignment.teacherId, names)
    }
    return map
  }, [classSubjectAssignments, subjectNames])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return teachers.filter(
      (t) =>
        q === '' ||
        t.full_name.toLowerCase().includes(q) ||
        (t.staff_no ?? '').toLowerCase().includes(q) ||
        (t.email ?? '').toLowerCase().includes(q),
    )
  }, [teachers, search])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setAssignmentSelection(new Set())
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (t: TeacherRow) => {
    setEditing(t)
    setAssignmentSelection(new Set(
      classSubjectAssignments
        .filter((assignment) => assignment.teacherId === t.id)
        .map((assignment) => `${assignment.classId}:${assignment.subjectId}`),
    ))
    setForm({
      fullName: t.full_name,
      email: t.email ?? '',
      phone: t.phone ?? '',
      staffNo: t.staff_no ?? '',
      primarySubjectId: t.primary_subject_id ?? '',
      status: t.status,
    })
    setErrors({})
    setAlsoRevoke(true)
    setModalOpen(true)
  }

  const validate = () => {
    const next: FieldErrors = {}
    if (!minLength(form.fullName, 2)) next.fullName = "Enter the teacher's full name."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate() || !schoolId) return
    setIsSaving(true)
    const input = {
      fullName: form.fullName,
      email: form.email || null,
      phone: form.phone || null,
      staffNo: form.staffNo || null,
      primarySubjectId: form.primarySubjectId || null,
      status: form.status,
    }
    let teacherId = editing?.id
    let revokingToo = false
    try {
      if (editing) {
        await updateTeacher(schoolId, editing.id, input)
        // Explicit, never silent: the form asked, and only then does the
        // separate membership write happen (S4).
        const current = access.get(editing.id)
        revokingToo =
          alsoRevoke && form.status === 'inactive' && editing.status === 'active' && current?.status === 'active'
        if (revokingToo && current) await revokeAccess(schoolId, current.membershipId)
      } else {
        teacherId = await createTeacher(schoolId, input)
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: editing ? 'Teacher not updated' : 'Teacher not added',
        description: errorMessage(err),
      })
      setIsSaving(false)
      return
    }

    try {
      if (!teacherId) throw new Error('The saved teacher record could not be identified.')
      const assignments = Array.from(assignmentSelection)
        .map((key) => {
          const separator = key.indexOf(':')
          if (separator < 0) return null
          return { classId: key.slice(0, separator), subjectId: key.slice(separator + 1) }
        })
        .filter((assignment): assignment is { classId: string; subjectId: string } => assignment !== null)
      await saveTeacherClassSubjectAssignments(schoolId, teacherId, assignments)
      if (editing) {
        showToast({
          type: 'success',
          title: 'Teacher updated',
          description: revokingToo ? 'Their app access has been revoked as well.' : undefined,
        })
      } else {
        showToast({ type: 'success', title: 'Teacher added', description: 'Invite them separately so they can sign in.' })
      }
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Teacher saved, assignments not saved',
        description: `The staff record exists. Review and save class/subject assignments again. ${errorMessage(err)}`,
      })
      setModalOpen(false)
      reload()
    } finally {
      setIsSaving(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id))
  const toggleAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((t) => t.id)))

  /**
   * Invites everybody selected, paced, through the same function the single-row
   * button uses. A failed send has already revoked its own invitation before it
   * is reported, and re-running answers 'already_invited' rather than sending
   * a second email.
   */
  const inviteSelected = async () => {
    if (!schoolId || selected.size === 0) return
    const targets = filtered
      .filter((t) => selected.has(t.id))
      .map((t) => ({ id: t.id, name: t.full_name, email: t.email }))

    setBulkRunning(true)
    setBulkResults(null)
    setBulkProgress({ done: 0, total: targets.length, current: null, pausing: false })
    try {
      const results = await runBulkInvite({ schoolId, role: 'teacher', targets, onProgress: setBulkProgress })
      setBulkResults(results)
      const sentIds = new Set(results.filter((r) => r.outcome.status === 'sent').map((r) => r.id))
      setSelected((current) => new Set([...current].filter((id) => !sentIds.has(id))))
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Bulk invitation stopped', description: errorMessage(err) })
    } finally {
      setBulkRunning(false)
      setBulkProgress(null)
      reload()
    }
  }

  /**
   * Invites one teacher. The outcome is shown plainly, including the reason a
   * person was skipped, because "nothing happened" is the worst possible answer
   * to a button that is supposed to send an email.
   */
  const invite = async (teacher: TeacherRow) => {
    if (!schoolId) return
    setInviting(teacher.id)
    try {
      const outcome = await sendInvitation({ schoolId, role: 'teacher', personId: teacher.id })
      if (outcome.status === 'sent') {
        showToast({
          type: 'success',
          title: `Invitation sent to ${outcome.email}`,
          description: `${teacher.full_name} can now create their password.`,
        })
      } else {
        showToast({
          type: outcome.status === 'skipped' ? 'warning' : 'error',
          title: outcome.status === 'skipped' ? `Not invited: ${teacher.full_name}` : `Invitation not sent to ${teacher.full_name}`,
          description: outcome.message,
        })
      }
      reload()
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Invitation not sent', description: errorMessage(err) })
    } finally {
      setInviting(null)
    }
  }

  const confirmAccessChange = async () => {
    if (!accessTarget || !schoolId) return
    const { teacher, current } = accessTarget
    const revoking = current.status === 'active'
    try {
      if (revoking) await revokeAccess(schoolId, current.membershipId)
      else await restoreAccess(schoolId, current.membershipId)
      showToast({
        type: 'success',
        title: revoking ? 'Access revoked' : 'Access restored',
        description: revoking
          ? `${teacher.full_name} can no longer sign in. Their staff record is unchanged.`
          : `${teacher.full_name} can sign in again.`,
      })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: revoking ? 'Access not revoked' : 'Access not restored',
        description: errorMessage(err),
      })
    } finally {
      setAccessTarget(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !schoolId) return
    try {
      await deleteTeacher(schoolId, deleteTarget.id)
      showToast({ type: 'success', title: 'Teacher removed' })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Teacher not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Teaching staff at your school."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)} icon={<FileSpreadsheet className="h-4 w-4" />}>
              Bulk Import
            </Button>
            <Button onClick={openAdd} icon={<Plus className="h-4 w-4" />}>Add Teacher</Button>
          </div>
        }
      />

      <ResourceGate
        state={state}
        empty={{ icon: GraduationCap, title: 'No teachers yet', description: 'Add your first member of teaching staff.' }}
        deniedHint="Staff records are available to school management."
      >
        {() => (
          <>
            <div className="mb-5">
              <SearchInput value={search} onChange={setSearch} placeholder="Search by name, staff number or email…" className="sm:w-80" />
            </div>

            <BulkInviteBar
              selectedCount={selected.size}
              running={bulkRunning}
              progress={bulkProgress}
              results={bulkResults}
              onInvite={() => void inviteSelected()}
              onClear={() => setSelected(new Set())}
              onDismissResults={() => setBulkResults(null)}
            />

            {filtered.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No teachers found" description="Try a different search." />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/5 text-left text-xs text-graphite dark:border-white/10">
                      <th className="w-10 px-5 py-3.5">
                        <input
                          type="checkbox"
                          aria-label="Select all teachers"
                          checked={allFilteredSelected}
                          onChange={toggleAll}
                          disabled={bulkRunning}
                          className="h-4 w-4 rounded border-ink/20 accent-brand"
                        />
                      </th>
                      <th className="px-5 py-3.5 font-medium">Teacher</th>
                      <th className="px-5 py-3.5 font-medium">Staff No.</th>
                      <th className="px-5 py-3.5 font-medium">Subjects taught</th>
                      <th className="px-5 py-3.5 font-medium">Classes</th>
                      <th className="px-5 py-3.5 font-medium">Staff status</th>
                      <th className="px-5 py-3.5 font-medium">App access</th>
                      <th className="px-5 py-3.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} className="border-b border-ink/5 last:border-b-0 dark:border-white/5">
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${t.full_name}`}
                            checked={selected.has(t.id)}
                            onChange={() => toggle(t.id)}
                            disabled={bulkRunning}
                            className="h-4 w-4 rounded border-ink/20 accent-brand"
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={t.full_name} size="sm" />
                            <div>
                              <p className="font-medium text-ink dark:text-white">{t.full_name}</p>
                              <p className="text-xs text-graphite">{t.email ?? t.phone ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-graphite">{t.staff_no ?? '—'}</td>
                        <td className="px-5 py-3.5 text-graphite">
                          {(() => {
                            const assigned = Array.from(assignedSubjectsByTeacher.get(t.id) ?? [])
                            const taught = assigned.length > 0
                              ? assigned
                              : t.primary_subject_id
                                ? [subjectNames.get(t.primary_subject_id)].filter((name): name is string => Boolean(name))
                                : []
                            const visible = taught.slice(0, 1)
                            const remaining = taught.slice(1)
                            const detailsId = `teacher-subjects-${t.id}`
                            const expanded = expandedSubjectsTeacherId === t.id

                            if (taught.length === 0) return '—'

                            return (
                              <div className="relative flex flex-wrap items-center gap-1.5">
                                {visible.map((subject) => (
                                  <span
                                    key={subject}
                                    className="inline-flex max-w-36 truncate rounded-full border border-ink/10 bg-mist px-2 py-1 text-xs text-ink dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                                    title={subject}
                                  >
                                    {subject}
                                  </span>
                                ))}
                                {remaining.length > 0 && (
                                  <button
                                    type="button"
                                    aria-expanded={expanded}
                                    aria-controls={detailsId}
                                    aria-label={`${expanded ? 'Hide' : 'Show'} ${remaining.length} more subjects for ${t.full_name}`}
                                    title={taught.join(', ')}
                                    onClick={() => setExpandedSubjectsTeacherId(expanded ? null : t.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') setExpandedSubjectsTeacherId(null)
                                    }}
                                    className="inline-flex min-h-8 items-center rounded-full border border-brand/20 bg-brand/[0.06] px-2.5 text-xs font-medium text-brand hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                  >
                                    +{remaining.length} more
                                  </button>
                                )}
                                {remaining.length > 0 && expanded && (
                                  <div
                                    id={detailsId}
                                    className="basis-full rounded-xl border border-ink/10 bg-white p-3 dark:border-white/10 dark:bg-[#202328]"
                                    aria-label={`All subjects taught by ${t.full_name}`}
                                  >
                                    <ul className="flex flex-wrap gap-1.5">
                                      {taught.map((subject) => (
                                        <li
                                          key={subject}
                                          className="max-w-full rounded-full bg-mist px-2 py-1 text-xs text-ink dark:bg-white/[0.08] dark:text-white"
                                        >
                                          {subject}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-5 py-3.5 text-graphite">
                          {(() => {
                            const assignedClasses = classesByTeacher.get(t.id) ?? []
                            const visibleClasses = assignedClasses.slice(0, 1)
                            const remainingClasses = assignedClasses.slice(1)
                            const expanded = expandedClassesTeacherId === t.id
                            const detailsId = `teacher-classes-${t.id}`

                            if (assignedClasses.length === 0) return '—'

                            return (
                              <div className="relative flex flex-wrap items-center gap-1.5">
                                {visibleClasses.map((className) => (
                                  <span
                                    key={className}
                                    className="inline-flex max-w-36 truncate rounded-full border border-ink/10 bg-mist px-2 py-1 text-xs text-ink dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                                    title={className}
                                  >
                                    {className}
                                  </span>
                                ))}
                                {remainingClasses.length > 0 && (
                                  <button
                                    type="button"
                                    aria-expanded={expanded}
                                    aria-controls={detailsId}
                                    aria-label={`${expanded ? 'Hide' : 'Show'} ${remainingClasses.length} more classes for ${t.full_name}`}
                                    title={assignedClasses.join(', ')}
                                    onClick={() => setExpandedClassesTeacherId(expanded ? null : t.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') setExpandedClassesTeacherId(null)
                                    }}
                                    className="inline-flex min-h-8 items-center rounded-full border border-brand/20 bg-brand/[0.06] px-2.5 text-xs font-medium text-brand hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                  >
                                    +{remainingClasses.length}
                                  </button>
                                )}
                                {remainingClasses.length > 0 && expanded && (
                                  <div
                                    id={detailsId}
                                    className="absolute left-0 top-full z-20 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-ink/10 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#202328]"
                                    aria-label={`All assigned classes for ${t.full_name}`}
                                  >
                                    <ul className="flex flex-wrap gap-1.5">
                                      {assignedClasses.map((className) => (
                                        <li
                                          key={className}
                                          className="max-w-full rounded-full bg-mist px-2 py-1 text-xs text-ink dark:bg-white/[0.08] dark:text-white"
                                        >
                                          {className}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={t.status === 'active' ? 'success' : 'neutral'}>{t.status}</Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          {(() => {
                            const a = access.get(t.id)
                            if (!a) {
                              const pending = t.email ? invitations.get(t.email.toLowerCase()) : undefined
                              return pending ? (
                                <Badge tone="warning">Invited</Badge>
                              ) : (
                                <span className="text-xs text-graphite">No login</span>
                              )
                            }
                            return (
                              <Badge tone={a.status === 'active' ? 'brand' : 'danger'}>
                                {a.status === 'active' ? 'Active' : 'Revoked'}
                              </Badge>
                            )
                          })()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
                              aria-label={`Edit ${t.full_name}`}
                              className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {(() => {
                              const a = access.get(t.id)
                              if (a) return null
                              const pending = t.email ? invitations.get(t.email.toLowerCase()) : undefined
                              return (
                                <button
                                  type="button"
                                  disabled={!t.email || inviting === t.id}
                                  aria-busy={inviting === t.id || undefined}
                                  onClick={() => void invite(t)}
                                  aria-label={`${pending ? 'Resend invitation to' : 'Invite'} ${t.full_name}`}
                                  title={t.email ? (pending ? 'Resend invitation' : 'Invite to Nom Cloud') : 'Add an email address first'}
                                  className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                  {inviting === t.id ? <ThinkingOrb state="working" size={20} color="#C9471B" aria-label="Sending invitation" /> : <Mail className="h-4 w-4" />}
                                </button>
                              )
                            })()}
                            {(() => {
                              const a = access.get(t.id)
                              if (!a) return null
                              const revoking = a.status === 'active'
                              return (
                                <button
                                  type="button"
                                  onClick={() => setAccessTarget({ teacher: t, current: a })}
                                  aria-label={`${revoking ? 'Revoke' : 'Restore'} app access for ${t.full_name}`}
                                  title={revoking ? 'Revoke app access' : 'Restore app access'}
                                  className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                  {revoking ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                </button>
                              )
                            })()}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(t)}
                              aria-label={`Remove ${t.full_name}`}
                              className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Teacher' : 'Add Teacher'}
        footer={
          isSaving ? <RequestProcessing compact title={editing ? 'Updating teacher' : 'Creating teacher'} description="Saving your changes securely…" /> :
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Teacher'}
            </Button>
          </>
        }
      >
        {isSaving ? <RequestProcessing title={editing ? 'Updating teacher' : 'Creating teacher'} description="Your teacher details are being saved securely." /> : <div className="space-y-4">
          <Input label="Full name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Staff number" value={form.staffNo} onChange={(e) => setForm({ ...form, staffNo: e.target.value })} />
            <Select
              label="Primary subject"
              value={form.primarySubjectId}
              onChange={(e) => setForm({ ...form, primarySubjectId: e.target.value })}
            >
              <option value="">None</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <section className="space-y-3 border-t border-ink/[0.06] pt-4 dark:border-white/10">
            <div>
              <h3 className="text-sm font-semibold text-ink dark:text-white">Teaching assignments</h3>
              <p className="mt-1 text-xs text-graphite">Assign one or more subjects in each class. A class/subject pair can have one teacher.</p>
            </div>
            {classes.length === 0 || subjects.length === 0 ? (
              <p className="rounded-lg bg-mist p-3 text-sm text-graphite dark:bg-white/5">
                Add classes and subjects before creating teaching assignments.
              </p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {classes.map((classItem) => (
                  <fieldset key={classItem.id} className="rounded-xl border border-ink/[0.08] p-3 dark:border-white/10">
                    <legend className="px-1 text-sm font-semibold text-ink dark:text-white">{classItem.name}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {subjects.map((subject) => {
                        const key = `${classItem.id}:${subject.id}`
                        const current = classSubjectAssignments.find(
                          (assignment) => assignment.classId === classItem.id && assignment.subjectId === subject.id,
                        )
                        const assignedToOther = Boolean(current?.teacherId && current.teacherId !== editing?.id)
                        const currentTeacherName = current?.teacherId
                          ? teachers.find((teacher) => teacher.id === current.teacherId)?.full_name
                          : null
                        return (
                          <label key={subject.id} className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${assignedToOther ? 'text-graphite/70' : 'text-ink dark:text-white'}`}>
                            <input
                              type="checkbox"
                              checked={assignmentSelection.has(key)}
                              disabled={assignedToOther}
                              onChange={(event) => setAssignmentSelection((currentSelection) => {
                                const next = new Set(currentSelection)
                                if (event.target.checked) next.add(key)
                                else next.delete(key)
                                return next
                              })}
                              className="h-4 w-4 shrink-0 accent-brand"
                            />
                            <span className="min-w-0 flex-1">{subject.name}</span>
                            {assignedToOther && <span className="text-right text-[11px]">{currentTeacherName ?? 'Assigned'}</span>}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </section>
          <div>
            <Select label="Staff status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <p className="mt-1.5 text-xs text-graphite">
              Whether they currently work here. On its own this does not affect whether they can sign in.
            </p>
          </div>
          {editing && (
            <div className="rounded-xl bg-mist p-3 dark:bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink dark:text-white">App access</p>
                {(() => {
                  const a = access.get(editing.id)
                  if (!a) return <span className="text-xs text-graphite">No login yet — send an invitation</span>
                  return (
                    <Badge tone={a.status === 'active' ? 'brand' : 'danger'}>
                      {a.status === 'active' ? 'Active' : 'Revoked'}
                    </Badge>
                  )
                })()}
              </div>
              {access.get(editing.id)?.status === 'active' && form.status === 'inactive' && (
                <div className="mt-2 border-t border-ink/5 pt-2 dark:border-white/10">
                  <Switch
                    checked={alsoRevoke}
                    onChange={setAlsoRevoke}
                    label="Also revoke their app access"
                    description="Marking someone inactive does not block their login on its own."
                  />
                </div>
              )}
            </div>
          )}
          {editing && <p className="text-xs text-graphite">Joined {formatDate(editing.joined_date)}</p>}
          <p className="text-xs text-graphite">
            This records a member of staff. It does not create a login. Send them an invitation so they can sign in and
            see their classes.
          </p>
        </div>}
      </Modal>

      <ConfirmDialog
        open={!!accessTarget}
        title={
          accessTarget?.current.status === 'active'
            ? `Revoke ${accessTarget?.teacher.full_name}'s app access?`
            : `Restore ${accessTarget?.teacher.full_name}'s app access?`
        }
        description={
          accessTarget?.current.status === 'active'
            ? 'They will be signed out of Nom Cloud and will not be able to sign in. Their staff record, classes and history are kept, and you can restore access at any time.'
            : 'They will be able to sign in again with their existing account, in the same role.'
        }
        confirmLabel={accessTarget?.current.status === 'active' ? 'Revoke Access' : 'Restore Access'}
        danger={accessTarget?.current.status === 'active'}
        onConfirm={confirmAccessChange}
        onCancel={() => setAccessTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Remove ${deleteTarget?.full_name}?`}
        description="This removes their staff record. It is refused while they are the homeroom of a class, teach a subject, or still have an app login — unassign their classes and revoke their access first. To block their login only, use Revoke access instead."
        confirmLabel="Remove Teacher"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ImportDialog kind={teachersImport} open={bulkOpen} onClose={() => setBulkOpen(false)} onImported={reload} />
    </div>
  )
}
