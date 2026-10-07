import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Users, Plus, Pencil, Trash as Trash2, Upload, FileXls as FileSpreadsheet, CaretUp, CaretDown } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Avatar from '@/components/ui/Avatar'
import ResourceGate from '@/components/ui/ResourceGate'
import RequestProcessing from '@/components/ui/RequestProcessing'
import ImportDialog from '@/components/import/ImportDialog'
import { studentsImport } from '@/services/import/kinds'
import { deriveResourceState } from '@/lib/resourceState'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { useAcademicStructure } from '@/hooks/useAcademicStructure'
import {
  createStudent,
  deleteStudent,
  endEnrolment,
  enrolStudent,
  fetchStudentDirectory,
  updateStudent,
  STUDENT_STATUSES,
  type DirectoryStudent,
  type StudentGender,
} from '@/services/studentService'
import {
  createAndLinkGuardian,
  fetchSchoolGuardians,
  GUARDIAN_RELATIONSHIPS,
  linkGuardianToStudent,
  type GuardianRelationship,
  type GuardianRow,
} from '@/services/guardianService'
import { isValidEmail, minLength, type FieldErrors } from '@/utils/validators'
import { sendInvitation } from '@/services/invitationService'
import { todayInTimeZone, DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { IMAGE_ACCEPT, prepareImage } from '@/lib/imageUpload'
import { BUCKETS, createSignedImageUrls, removeStudentPhoto, replaceStudentPhoto } from '@/services/storageService'
import { errorMessage, toError } from '@/utils/errorMessage'
import { monthAnchor, percentageChange, recentMonthlyCounts } from '@/utils/adminAnalytics'

// ===== CONSTANTS =====
const ITEMS_PER_PAGE = 25

type SortField = 'name' | 'admissionNo' | 'status' | 'none'
type SortOrder = 'asc' | 'desc'

const emptyForm = {
  name: '',
  admissionNo: '',
  classId: '',
  gender: 'male',
  dateOfBirth: '',
  status: 'active',
  guardianId: '',
  guardianIsPrimary: false,
  guardianRelationship: '' as GuardianRelationship | '',
  newGuardianName: '',
  newGuardianEmail: '',
  newGuardianPhone: '',
  inviteGuardian: false,
}

function guardianLabel(g: DirectoryStudent['guardians'][number]): string {
  return g.relationship ? `${g.name} (${g.relationship})` : g.name
}

/** Format guardian count for table display */
function guardianDisplay(guardians: DirectoryStudent['guardians']): string {
  if (guardians.length === 0) return '—'
  if (guardians.length === 1) return `1 guardian`
  return `${guardians.length} guardians`
}

export default function AdminStudents() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const { classes } = useRecordableClasses()
  const { state: academicState } = useAcademicStructure()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const activeYearId = academicState.status === 'ready' ? (academicState.data.activeYear?.id ?? '') : ''

  // ===== DATA STATE =====
  const [students, setStudents] = useState<DirectoryStudent[]>([])
  const [guardians, setGuardians] = useState<GuardianRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  // ===== FILTER & SORT STATE =====
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [currentPage, setCurrentPage] = useState(1)

  // ===== MODAL & FORM STATE =====
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DirectoryStudent | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [guardianMode, setGuardianMode] = useState<'existing' | 'new' | 'none'>('none')
  const [deleteTarget, setDeleteTarget] = useState<DirectoryStudent | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // ===== FETCH DATA =====
  useEffect(() => {
    let cancelled = false
    if (!schoolId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    Promise.all([fetchStudentDirectory(schoolId), fetchSchoolGuardians(schoolId)])
      .then(([rows, gs]) => {
        if (cancelled) return
        setStudents(rows)
        setGuardians(gs)
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

  // ===== FETCH PHOTOS =====
  useEffect(() => {
    let cancelled = false
    const paths = students.map((s) => s.photoPath).filter((p): p is string => p !== null)
    if (paths.length === 0) {
      setPhotoUrls(new Map())
      return
    }
    createSignedImageUrls(BUCKETS.studentPhotos, paths).then((urls) => {
      if (!cancelled) setPhotoUrls(urls)
    })
    return () => {
      cancelled = true
    }
  }, [students])

  const applyPhotoPath = (studentId: string, photoPath: string | null) => {
    setStudents((rows) => rows.map((r) => (r.id === studentId ? { ...r, photoPath } : r)))
    setEditing((current) => (current && current.id === studentId ? { ...current, photoPath } : current))
  }

  const handlePhotoChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editing || !schoolId) return
    setPhotoBusy(true)
    try {
      const image = await prepareImage(file, 'studentPhoto')
      const path = await replaceStudentPhoto(schoolId, editing.id, editing.photoPath, image)
      applyPhotoPath(editing.id, path)
      showToast({ type: 'success', title: 'Photo updated' })
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Photo not uploaded', description: errorMessage(err) })
    } finally {
      setPhotoBusy(false)
    }
  }

  const handlePhotoRemoved = async () => {
    if (!editing || !schoolId) return
    setPhotoBusy(true)
    try {
      await removeStudentPhoto(schoolId, editing.id, editing.photoPath)
      applyPhotoPath(editing.id, null)
      showToast({ type: 'success', title: 'Photo removed' })
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Photo not removed', description: errorMessage(err) })
    } finally {
      setPhotoBusy(false)
    }
  }

  const state = deriveResourceState<DirectoryStudent[]>({
    isLoading,
    canAccess: schoolId !== null,
    error,
    data: students,
    retry: reload,
  })

  // ===== FILTER & SORT LOGIC =====
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      const matchesSearch =
        q === '' || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q)
      const matchesClass = classFilter === 'all' || s.classId === classFilter
      return matchesSearch && matchesClass
    })
  }, [students, search, classFilter])
  const enrollmentTrend = useMemo(
    () => recentMonthlyCounts(students.map((student) => student.enrolledDate), 6, monthAnchor(timeZone)),
    [students, timeZone],
  )
  const enrollmentTrendChange = percentageChange(
    enrollmentTrend.values.at(-1) ?? 0,
    enrollmentTrend.values.at(-2) ?? 0,
  )
  const studentsByClass = useMemo(
    () => classes
      .map((classroom) => ({ label: classroom.name, value: classroom.studentIds.length }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [classes],
  )

  const sorted = useMemo(() => {
    if (sortField === 'none') return filtered

    const copy = [...filtered]
    copy.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      if (sortField === 'name') {
        aVal = a.name.toLowerCase()
        bVal = b.name.toLowerCase()
      } else if (sortField === 'admissionNo') {
        aVal = a.admissionNo.toLowerCase()
        bVal = b.admissionNo.toLowerCase()
      } else if (sortField === 'status') {
        aVal = a.status
        bVal = b.status
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [filtered, sortField, sortOrder])

  // ===== PAGINATION =====
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE)
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return sorted.slice(start, start + ITEMS_PER_PAGE)
  }, [sorted, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, classFilter, sortField, sortOrder])

  // ===== SORT HANDLER =====
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle sort order if clicking same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? (
      <CaretUp className="inline h-3 w-3 ml-1" />
    ) : (
      <CaretDown className="inline h-3 w-3 ml-1" />
    )
  }

  // ===== MODAL HANDLERS =====
  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, classId: classes[0]?.id ?? '', guardianIsPrimary: true })
    setGuardianMode('none')
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (student: DirectoryStudent) => {
    setEditing(student)
    setForm({
      name: student.name,
      admissionNo: student.admissionNo,
      classId: student.classId ?? '',
      gender: student.gender ?? 'male',
      dateOfBirth: student.dateOfBirth ?? '',
      status: student.status,
      guardianId: '',
      guardianIsPrimary: !student.guardians.some((g) => g.isPrimary),
      guardianRelationship: '',
      newGuardianName: '',
      newGuardianEmail: '',
      newGuardianPhone: '',
      inviteGuardian: false,
    })
    setGuardianMode('none')
    setErrors({})
    setModalOpen(true)
  }

  const currentPrimaryName = editing?.guardians.find((g) => g.isPrimary)?.name ?? null

  const validate = () => {
    const next: FieldErrors = {}
    if (!minLength(form.name, 2)) next.name = "Enter the student's full name."
    if (!minLength(form.admissionNo, 2)) next.admissionNo = 'Enter an admission number.'
    if (form.dateOfBirth && form.dateOfBirth >= todayInTimeZone(timeZone)) {
      next.dateOfBirth = 'Date of birth must be before today.'
    }
    if (form.classId && !activeYearId) {
      next.classId = 'Set an active academic year before enrolling a student in a class.'
    }
    if (guardianMode === 'existing' && !form.guardianId) next.guardianId = 'Select a guardian.'
    if (guardianMode !== 'none' && !form.guardianRelationship) {
      next.guardianRelationship = "Choose the guardian's relationship to the student."
    }
    if (guardianMode === 'new') {
      if (!minLength(form.newGuardianName, 2)) next.newGuardianName = "Enter the guardian's name."
      if (!minLength(form.newGuardianPhone, 6)) next.newGuardianPhone = 'Enter a phone number.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate() || !schoolId) return
    setIsSaving(true)

    const input = {
      fullName: form.name,
      admissionNo: form.admissionNo,
      gender: (form.gender || null) as StudentGender | null,
      dateOfBirth: form.dateOfBirth || null,
      status: form.status,
    }

    try {
      let studentId = editing?.id ?? ''
      if (editing) {
        await updateStudent(schoolId, editing.id, input)
        if (form.classId !== (editing.classId ?? '')) {
          await endEnrolment(schoolId, editing.id, todayInTimeZone(timeZone))
          if (form.classId && activeYearId) {
            await enrolStudent(schoolId, editing.id, form.classId, activeYearId)
          }
        }
      } else {
        studentId = await createStudent(schoolId, input)
        if (form.classId && activeYearId) {
          await enrolStudent(schoolId, studentId, form.classId, activeYearId)
        }
      }

      let guardianNote: string | undefined
      let guardianId: string | null = null
      let guardianEmail: string | null = null
      if (guardianMode === 'existing' && form.guardianId) {
        const relationship = form.guardianRelationship || null
        const outcome = await linkGuardianToStudent(
          schoolId,
          studentId,
          form.guardianId,
          form.guardianIsPrimary,
          relationship,
        )
        const chosen = guardians.find((g) => g.id === form.guardianId)
        guardianId = form.guardianId
        guardianEmail = chosen?.email ?? null
        const name = chosen?.full_name ?? 'The guardian'
        guardianNote =
          outcome === 'already_linked'
            ? `${name} was already linked to this student.`
            : outcome === 'relationship_updated'
              ? `${name}'s relationship is now ${relationship}.`
              : outcome === 'linked'
                ? `${name} was linked as ${relationship}.`
                : `${name} is now the primary contact.`
      } else if (guardianMode === 'new') {
        guardianId = await createAndLinkGuardian(
          schoolId,
          studentId,
          {
            fullName: form.newGuardianName,
            email: form.newGuardianEmail || null,
            phone: form.newGuardianPhone,
          },
          form.guardianIsPrimary,
          form.guardianRelationship || null,
        )
        guardianEmail = form.newGuardianEmail || null
        guardianNote = form.guardianIsPrimary
          ? `${form.newGuardianName} was added as the primary contact.`
          : `${form.newGuardianName} was added as a guardian.`
      }

      let inviteNote: string | undefined
      if (form.inviteGuardian && guardianId && schoolId) {
        try {
          const outcome = await sendInvitation({ schoolId, role: 'guardian', personId: guardianId })
          inviteNote =
            outcome.status === 'sent'
              ? `Invitation sent to ${outcome.email ?? guardianEmail ?? 'their email'}.`
              : `Not invited: ${outcome.message ?? 'the invitation could not be sent.'}`
        } catch (inviteError: unknown) {
          inviteNote = `Not invited: ${errorMessage(inviteError)}`
        }
      }

      showToast({
        type: 'success',
        title: editing ? 'Student updated' : 'Student added',
        description: [guardianNote, inviteNote].filter(Boolean).join(' ') || undefined,
      })
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: editing ? 'Student not updated' : 'Student not added',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !schoolId) return
    try {
      await deleteStudent(schoolId, deleteTarget.id)
      showToast({ type: 'success', title: 'Student removed' })
      reload()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Student not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description="Every student enrolled at your school."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)} icon={<FileSpreadsheet className="h-4 w-4" />}>
              Bulk Import
            </Button>
            <Button onClick={openAdd} icon={<Plus className="h-4 w-4" />}>Add Student</Button>
          </div>
        }
      />

      <ResourceGate
        state={state}
        empty={{ icon: Users, title: 'No students yet', description: 'Add your first student to get started.' }}
        deniedHint="Student records are available to school staff."
      >
        {() => (
          <>
            {!isLoading && !error && (
              <AdminSectionInsights
                metrics={[
                  { label: 'Students', value: students.length },
                  {
                    label: 'New this month',
                    value: enrollmentTrend.values.at(-1) ?? 0,
                    change: enrollmentTrendChange === null ? undefined : {
                      value: `${Math.abs(enrollmentTrendChange).toFixed(1)}%`,
                      direction: enrollmentTrendChange > 0 ? 'up' : enrollmentTrendChange < 0 ? 'down' : 'flat',
                      positive: enrollmentTrendChange >= 0,
                    },
                  },
                  { label: 'Classes', value: classes.length },
                ]}
                charts={[
                  {
                    kind: 'line',
                    title: 'New student enrollment',
                    categories: enrollmentTrend.labels,
                    series: [{ label: 'Enrolled', values: enrollmentTrend.values }],
                  },
                ]}
                insight={enrollmentTrendChange === null
                  ? 'Monthly enrollment counts use student enrollment dates; a percentage comparison is unavailable when last month had no new students.'
                  : `${Math.abs(enrollmentTrendChange).toFixed(1)}% ${enrollmentTrendChange >= 0 ? 'more' : 'fewer'} new enrollments than last month.`}
              />
            )}

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput 
                value={search} 
                onChange={setSearch} 
                placeholder="Search by name or admission number…" 
                className="sm:w-80" 
              />
              <Select 
                value={classFilter} 
                onChange={(e) => setClassFilter(e.target.value)} 
                className="sm:w-52"
              >
                <option value="all">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* TABLE OR EMPTY STATE */}
            {filtered.length === 0 ? (
              <EmptyState icon={Users} title="No students found" description="Try adjusting your search or filters." />
            ) : (
              <>
                {/* TABLE */}
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-ink/5 text-left text-xs text-graphite dark:border-white/10">
                        <th 
                          className="px-5 py-3.5 font-medium cursor-pointer hover:text-ink dark:hover:text-white"
                          onClick={() => handleSort('name')}
                        >
                          Student {getSortIcon('name')}
                        </th>
                        <th 
                          className="px-5 py-3.5 font-medium cursor-pointer hover:text-ink dark:hover:text-white"
                          onClick={() => handleSort('admissionNo')}
                        >
                          Admission No. {getSortIcon('admissionNo')}
                        </th>
                        <th className="px-5 py-3.5 font-medium">Class</th>
                        <th className="px-5 py-3.5 font-medium">Guardians</th>
                        <th 
                          className="px-5 py-3.5 font-medium cursor-pointer hover:text-ink dark:hover:text-white"
                          onClick={() => handleSort('status')}
                        >
                          Status {getSortIcon('status')}
                        </th>
                        <th className="px-5 py-3.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.map((s) => (
                        <tr key={s.id} className="border-b border-ink/5 last:border-b-0 dark:border-white/5">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar
                                name={s.name}
                                color={s.avatarColor}
                                size="sm"
                                src={s.photoPath ? photoUrls.get(s.photoPath) : null}
                              />
                              <p className="font-medium text-ink dark:text-white">{s.name}</p>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-graphite">{s.admissionNo}</td>
                          <td className="px-5 py-3.5 text-graphite">{s.className ?? '—'}</td>
                          <td className="px-5 py-3.5 text-graphite">{guardianDisplay(s.guardians)}</td>
                          <td className="px-5 py-3.5">
                            <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEdit(s)}
                                aria-label={`Edit ${s.name}`}
                                className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white transition-colors"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(s)}
                                aria-label={`Remove ${s.name}`}
                                className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500 transition-colors"
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

                {/* PAGINATION */}
                {totalPages > 1 && (
                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-sm text-graphite">
                      Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)} of {sorted.length} students
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </ResourceGate>

      <ImportDialog kind={studentsImport} open={bulkOpen} onClose={() => setBulkOpen(false)} onImported={reload} />

      {/* ADD/EDIT MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Student' : 'Add Student'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Add Student'}
            </Button>
          </>
        }
      >
        {isSaving ? (
          <RequestProcessing 
            title={editing ? 'Updating student' : 'Creating student'} 
            description="Your student details are being saved securely." 
          />
        ) : (
          <div className="space-y-4">
            {/* PHOTO SECTION */}
            {editing && (
              <div className="rounded-lg bg-ink/5 p-4 dark:bg-white/5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Avatar
                    name={editing.name}
                    color={editing.avatarColor}
                    size="lg"
                    src={editing.photoPath ? photoUrls.get(editing.photoPath) : null}
                  />
                  <div className="flex-1">
                    <input
                      ref={photoInput}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="hidden"
                      aria-label="Choose student photo"
                      onChange={handlePhotoChosen}
                    />
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={photoBusy}
                        onClick={() => photoInput.current?.click()}
                        icon={<Upload className="h-4 w-4" />}
                      >
                        {photoBusy ? 'Working…' : editing.photoPath ? 'Replace photo' : 'Upload photo'}
                      </Button>
                      {editing.photoPath && (
                        <Button variant="ghost" size="sm" disabled={photoBusy} onClick={handlePhotoRemoved}>
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-graphite">PNG, JPEG or WebP, up to 2 MB. Saved immediately.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STUDENT BASIC INFO */}
            <fieldset>
              <legend className="text-sm font-medium text-ink dark:text-white mb-3">Student Information</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input 
                  label="Full name" 
                  required 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })} 
                  error={errors.name} 
                />
                <Input
                  label="Admission number"
                  required
                  value={form.admissionNo}
                  onChange={(e) => setForm({ ...form, admissionNo: e.target.value })}
                  error={errors.admissionNo}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <Select 
                  label="Class" 
                  value={form.classId} 
                  onChange={(e) => setForm({ ...form, classId: e.target.value })} 
                  error={errors.classId}
                >
                  <option value="">Not enrolled</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select 
                  label="Status" 
                  value={form.status} 
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STUDENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                  {!STUDENT_STATUSES.some((s) => s.value === form.status) && (
                    <option value={form.status}>{form.status}</option>
                  )}
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <Select 
                  label="Gender" 
                  value={form.gender} 
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </Select>
                <Input
                  label="Date of birth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                  error={errors.dateOfBirth}
                />
              </div>
            </fieldset>

            {/* GUARDIAN SECTION - SIMPLIFIED */}
            <fieldset>
              <legend className="text-sm font-medium text-ink dark:text-white mb-3">Guardian (Optional)</legend>
              <p className="text-xs text-graphite mb-3">You can add a guardian now or skip and add them later.</p>

              <Select
                label="Guardian action"
                value={guardianMode}
                onChange={(e) => {
                  setGuardianMode(e.target.value as 'existing' | 'new' | 'none')
                  setErrors({ ...errors, guardianId: undefined, guardianRelationship: undefined })
                }}
              >
                <option value="none">Skip for now</option>
                <option value="existing">Link existing guardian</option>
                <option value="new">Add new guardian</option>
              </Select>

              {/* EXISTING GUARDIAN PATH */}
              {guardianMode === 'existing' && (
                <div className="mt-4 space-y-3">
                  <Select
                    label="Select guardian"
                    value={form.guardianId}
                    onChange={(e) => {
                      const guardianId = e.target.value
                      const saved = editing?.guardians.find((g) => g.id === guardianId)?.relationship
                      const known = GUARDIAN_RELATIONSHIPS.find((r) => r === saved)
                      setForm({ ...form, guardianId, guardianRelationship: known ?? form.guardianRelationship })
                    }}
                    error={errors.guardianId}
                  >
                    <option value="">Select a guardian…</option>
                    {guardians.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.full_name} ({g.phone})
                      </option>
                    ))}
                  </Select>

                  {form.guardianId && (
                    <Select
                      label="Relationship to student"
                      value={form.guardianRelationship}
                      onChange={(e) => setForm({ ...form, guardianRelationship: e.target.value as GuardianRelationship | '' })}
                      error={errors.guardianRelationship}
                    >
                      <option value="">Select relationship…</option>
                      {GUARDIAN_RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  )}

                  {form.guardianId && (
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-ink/20 accent-brand"
                        checked={form.guardianIsPrimary}
                        onChange={(e) => setForm({ ...form, guardianIsPrimary: e.target.checked })}
                      />
                      <span className="text-sm text-ink dark:text-white">
                        Primary contact
                        <span className="block text-xs text-graphite mt-0.5">
                          {currentPrimaryName
                            ? form.guardianIsPrimary
                              ? `${currentPrimaryName} will stop being the primary contact.`
                              : `${currentPrimaryName} stays the primary contact.`
                            : 'This guardian will be the first contact for emergencies.'}
                        </span>
                      </span>
                    </label>
                  )}

                  {form.guardianId && (
                    <GuardianInviteOption
                      guardian={guardians.find((g) => g.id === form.guardianId)}
                      inviteGuardian={form.inviteGuardian}
                      onInviteChange={(invited) => setForm({ ...form, inviteGuardian: invited })}
                    />
                  )}

                  {editing && editing.guardians.length > 0 && (
                    <p className="text-xs text-graphite bg-ink/5 dark:bg-white/5 p-3 rounded">
                      <strong>Already linked:</strong> {editing.guardians.map((g) => `${guardianLabel(g)}${g.isPrimary ? ' (primary)' : ''}`).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* NEW GUARDIAN PATH */}
              {guardianMode === 'new' && (
                <div className="mt-4 space-y-3">
                  <Input
                    label="Guardian full name"
                    placeholder="E.g., Amina Yusuf"
                    value={form.newGuardianName}
                    onChange={(e) => setForm({ ...form, newGuardianName: e.target.value })}
                    error={errors.newGuardianName}
                  />

                  <Input
                    label="Phone number"
                    placeholder="E.g., +252 61 123 4567"
                    value={form.newGuardianPhone}
                    onChange={(e) => setForm({ ...form, newGuardianPhone: e.target.value })}
                    error={errors.newGuardianPhone}
                  />

                  <Input
                    label="Email (optional)"
                    type="email"
                    placeholder="E.g., amina@email.com"
                    value={form.newGuardianEmail}
                    onChange={(e) => setForm({ ...form, newGuardianEmail: e.target.value })}
                  />

                  <Select
                    label="Relationship to student"
                    value={form.guardianRelationship}
                    onChange={(e) => setForm({ ...form, guardianRelationship: e.target.value as GuardianRelationship | '' })}
                    error={errors.guardianRelationship}
                  >
                    <option value="">Select relationship…</option>
                    {GUARDIAN_RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>

                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-ink/20 accent-brand"
                      checked={form.guardianIsPrimary}
                      onChange={(e) => setForm({ ...form, guardianIsPrimary: e.target.checked })}
                    />
                    <span className="text-sm text-ink dark:text-white">
                      Primary contact
                      <span className="block text-xs text-graphite mt-0.5">
                        This guardian will be the first contact for emergencies.
                      </span>
                    </span>
                  </label>

                  {form.newGuardianEmail && (
                    <GuardianInviteOptionNew
                      email={form.newGuardianEmail}
                      inviteGuardian={form.inviteGuardian}
                      onInviteChange={(invited) => setForm({ ...form, inviteGuardian: invited })}
                    />
                  )}
                </div>
              )}
            </fieldset>
          </div>
        )}
      </Modal>

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Remove ${deleteTarget?.name}?`}
        description="A student with fee payments on record cannot be removed: payment history must be kept for the school's financial records. Set their status to Inactive or Transferred instead."
        confirmLabel="Remove Student"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ===== HELPER COMPONENTS =====

function GuardianInviteOption({
  guardian,
  inviteGuardian,
  onInviteChange,
}: {
  guardian: GuardianRow | undefined
  inviteGuardian: boolean
  onInviteChange: (invited: boolean) => void
}) {
  const email = guardian?.email ?? ''
  const canInvite = email && isValidEmail(email)

  return (
    <label className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${canInvite ? 'bg-brand/5 dark:bg-brand/10' : 'bg-ink/5 dark:bg-white/5'}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-ink/20 accent-brand"
        checked={inviteGuardian && canInvite}
        disabled={!canInvite}
        onChange={(e) => onInviteChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className={canInvite ? 'font-medium text-ink dark:text-white' : 'text-graphite'}>
          Invite guardian to Nom Cloud
        </span>
        <span className="block text-xs text-graphite mt-0.5">
          {canInvite
            ? `They'll receive a sign-up link at ${email}`
            : 'No email address on file. Update the guardian profile to enable invites.'}
        </span>
      </span>
    </label>
  )
}

function GuardianInviteOptionNew({
  email,
  inviteGuardian,
  onInviteChange,
}: {
  email: string
  inviteGuardian: boolean
  onInviteChange: (invited: boolean) => void
}) {
  const canInvite = isValidEmail(email)

  return (
    <label className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${canInvite ? 'bg-brand/5 dark:bg-brand/10' : 'bg-ink/5 dark:bg-white/5'}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-ink/20 accent-brand"
        checked={inviteGuardian && canInvite}
        disabled={!canInvite}
        onChange={(e) => onInviteChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className={canInvite ? 'font-medium text-ink dark:text-white' : 'text-graphite'}>
          Invite guardian to Nom Cloud
        </span>
        <span className="block text-xs text-graphite mt-0.5">
          {canInvite
            ? `They'll receive a sign-up link at ${email}`
            : 'Add a valid email address to enable invites.'}
        </span>
      </span>
    </label>
  )
}
