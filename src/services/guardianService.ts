// ---------------------------------------------------------------------------
// Guardian to student resolution. Phase 8 batch 3.
//
// THIS FILE IS THE FIX FOR PLAN SECTION A.4.
//
// The bug: useSelectedChild resolved the signed-in guardian by comparing
// activeMembership.guardian_id, a real UUID, against mock parent ids 'p1' and
// 'p2' from the prototype seed. The comparison never matched, so every parent page
// rendered as though the account had no children. It has been broken for every
// real guardian since Phase 4 wired identity to Supabase while the data stayed
// mock.
//
// HOW "WHICH GUARDIAN IS THIS" IS RESOLVED NOW. The chain is entirely real and
// entirely server-side:
//
//   auth.uid()
//     -> memberships row with role = 'guardian'          (AuthContext)
//     -> memberships.guardian_id                          a real guardians.id
//     -> student_guardians (school_id, guardian_id)       the link rows
//     -> students (school_id, id)                         the children
//
// memberships.guardian_id is not a label the client chose. It is a composite
// foreign key, (school_id, guardian_id) -> guardians (school_id, id), written by
// accept_invitation at the moment the guardian redeemed their invitation. That
// is why it is trustworthy as the anchor.
//
// TENANT SCOPING. Both queries filter school_id and the specific guardian or
// student ids explicitly. Neither asks for a broad set and lets RLS narrow the
// answer. RLS is what makes a mistake safe, not what makes the query correct.
// Independently, is_guardian_of_student (batch 2 of the RLS rollout) means a
// guardian reading students sees only linked children even if this code were
// wrong, which is the belt and braces the design intends.
//
// WHY TWO QUERIES RATHER THAN ONE EMBEDDED SELECT. student_guardians reaches
// students through a COMPOSITE foreign key, (school_id, student_id). PostgREST
// resource embedding across composite foreign keys is not something to rely on
// silently, and a failure there would look like "this guardian has no children",
// which is precisely the bug being fixed. Two explicit queries cannot fail that
// way.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import { avatarColorForId } from '@/services/studentService'
import type { TimetableSlotView } from '@/services/teacherService'

export interface GuardianRow {
  id: string
  school_id: string
  full_name: string
  email: string | null
  phone: string
  status: string
  created_at: string
  updated_at: string
}

export interface StudentRow {
  id: string
  school_id: string
  full_name: string
  admission_no: string
  gender: string | null
  date_of_birth: string | null
  status: string
  enrolled_date: string
  photo_path: string | null
  created_at: string
  updated_at: string
}

/**
 * The child shape the parent screens render.
 *
 * A view model, not a row. `id` is the real students.id UUID, which is the part
 * that matters and the part that was broken. The display field names are kept
 * close to what the screens already used so this batch changes identity
 * resolution without also rewriting eight pages' markup.
 *
 * `avatarColor` is derived, never stored: SCHEMA_DESIGN section F lists it as
 * presentation that would otherwise be "34 bytes of design system in every
 * people row", and students has no such column.
 *
 * `classId` and `className` are resolved through class_enrollments, which batch
 * 4 connected. A student's class is NOT a column on students; it is a
 * time-scoped enrolment row, which is why SCHEMA_DESIGN gives students no
 * class_id at all. Both stay null for a child with no open enrolment, which is
 * a real state for a newly admitted pupil.
 */
export interface ChildSummary {
  id: string
  name: string
  admissionNo: string
  status: string
  enrolledDate: string
  avatarColor: string
  /** Object path in the private student-photos bucket, or null. */
  photoPath: string | null
  classId: string | null
  className: string | null
}

export function toChildSummary(
  student: StudentRow,
  enrolledClass?: { id: string; name: string } | null,
): ChildSummary {
  return {
    id: student.id,
    name: student.full_name,
    admissionNo: student.admission_no,
    status: student.status,
    enrolledDate: student.enrolled_date,
    avatarColor: avatarColorForId(student.id),
    photoPath: student.photo_path,
    classId: enrolledClass?.id ?? null,
    className: enrolledClass?.name ?? null,
  }
}

/** Timetable slots for a child's currently assigned class. */
export async function fetchChildTimetable(
  schoolId: string,
  classId: string,
): Promise<TimetableSlotView[]> {
  const { data, error } = await supabase
    .from('timetable_slots')
    .select('id, class_id, teacher_id, subject_id, day_of_week, period, start_time, end_time, room')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .order('day_of_week')
    .order('period')

  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    class_id: string
    teacher_id: string | null
    subject_id: string | null
    day_of_week: number
    period: number
    start_time: string
    end_time: string
    room: string | null
  }[]
  if (rows.length === 0) return []

  const subjectIds = Array.from(new Set(rows.flatMap((row) => row.subject_id ? [row.subject_id] : [])))
  const teacherIds = Array.from(new Set(rows.flatMap((row) => row.teacher_id ? [row.teacher_id] : [])))
  const [subjectsResult, teachersResult] = await Promise.all([
    subjectIds.length
      ? supabase.from('subjects').select('id, name').eq('school_id', schoolId).in('id', subjectIds)
      : Promise.resolve({ data: [], error: null }),
    teacherIds.length
      ? supabase.from('teachers').select('id, full_name').eq('school_id', schoolId).in('id', teacherIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (subjectsResult.error) throw subjectsResult.error
  if (teachersResult.error) throw teachersResult.error

  const subjectNames = new Map(
    ((subjectsResult.data ?? []) as { id: string; name: string }[]).map((subject) => [subject.id, subject.name]),
  )
  const teacherNames = new Map(
    ((teachersResult.data ?? []) as { id: string; full_name: string }[]).map((teacher) => [teacher.id, teacher.full_name]),
  )

  return rows.map((row) => ({
    id: row.id,
    classId: row.class_id,
    teacherId: row.teacher_id ?? '',
    subjectId: row.subject_id ?? null,
    day: row.day_of_week as TimetableSlotView['day'],
    period: row.period,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    subject: row.subject_id ? subjectNames.get(row.subject_id) ?? 'Subject unavailable' : '',
    teacherName: row.teacher_id ? teacherNames.get(row.teacher_id) : undefined,
    room: row.room ?? '',
  }))
}

/**
 * The open class enrolment for each of the given students, as id -> class.
 *
 * Phase 8 batch 4. This is what closed the gap batch 3 left: a parent could see
 * their child but not the child's class, because a class is reached through
 * class_enrollments rather than a column on students.
 *
 * `left_on IS NULL` is the available "still enrolled" signal. Plan section A.2
 * records that it is not a complete definition of "current", since rows can stay
 * open across academic years; tightening it needs the decision recorded there
 * and is not invented here. A student with no open enrolment resolves to null
 * rather than to a guessed class.
 */
export async function fetchEnrolledClasses(
  schoolId: string,
  studentIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const result = new Map<string, { id: string; name: string }>()
  if (studentIds.length === 0) return result

  const { data: enrolments, error: enrolError } = await supabase
    .from('class_enrollments')
    .select('student_id, class_id')
    .eq('school_id', schoolId)
    .in('student_id', studentIds)
    .is('left_on', null)

  if (enrolError) throw enrolError
  const rows = (enrolments ?? []) as { student_id: string; class_id: string }[]
  if (rows.length === 0) return result

  const classIds = Array.from(new Set(rows.map((r) => r.class_id)))
  const { data: classes, error: classError } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .in('id', classIds)

  if (classError) throw classError
  const byId = new Map<string, string>()
  for (const row of (classes ?? []) as { id: string; name: string }[]) byId.set(row.id, row.name)

  for (const row of rows) {
    const name = byId.get(row.class_id)
    if (name) result.set(row.student_id, { id: row.class_id, name })
  }
  return result
}

/** The signed-in guardian's own guardians row. */
export async function fetchGuardian(schoolId: string, guardianId: string): Promise<GuardianRow | null> {
  const { data, error } = await supabase
    .from('guardians')
    .select('*')
    .eq('school_id', schoolId)
    .eq('id', guardianId)
    .maybeSingle()

  if (error) throw error
  return (data as GuardianRow | null) ?? null
}

/**
 * The students linked to a guardian through student_guardians.
 *
 * Returns [] when the guardian has no links, which is a real and valid state:
 * a guardian account can exist before an administrator attaches a child to it.
 * The caller must render that as `empty`, never as `denied`.
 */
export async function fetchLinkedStudents(schoolId: string, guardianId: string): Promise<StudentRow[]> {
  const { data: links, error: linkError } = await supabase
    .from('student_guardians')
    .select('student_id')
    .eq('school_id', schoolId)
    .eq('guardian_id', guardianId)

  if (linkError) throw linkError

  const studentIds = (links ?? []).map((row) => (row as { student_id: string }).student_id)
  if (studentIds.length === 0) return []

  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('school_id', schoolId)
    .in('id', studentIds)
    .order('full_name', { ascending: true })

  if (studentError) throw studentError
  return (students ?? []) as StudentRow[]
}

// ===========================================================================
// MANAGEMENT WRITES. Phase 8 batch 8.
// ===========================================================================
// guardians and student_guardians gate writes on has_school_management_role.
// student_guardians is management-only by design: RLS batch 2 made it so
// precisely to stop a guardian attaching themselves to another family's child,
// and nothing in the interface offers that.

export interface GuardianInput {
  fullName: string
  email: string | null
  phone: string
}

/**
 * The relationships the interface offers when linking a guardian
 * (SYSTEM_ISSUES_LIST C2). student_guardians.relationship is free text; these
 * are the stored values the demo data and the bulk-import plan already use.
 */
export const GUARDIAN_RELATIONSHIPS = ['Mother', 'Father', 'Other'] as const
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number]

/** A guardian as the Guardians page shows them: with their children and access. */
export interface GuardianDirectoryRow extends GuardianRow {
  /** Names of the students this guardian is linked to, in display order. */
  studentNames: string[]
}

/**
 * Every guardian with the students they are linked to.
 *
 * Three scoped reads rather than an embedded select, for the reason every batch
 * has given: these tables meet through COMPOSITE foreign keys, and a silent
 * PostgREST embedding failure would look like a school with no guardians.
 */
export async function fetchGuardianDirectory(schoolId: string): Promise<GuardianDirectoryRow[]> {
  const guardians = await fetchSchoolGuardians(schoolId)
  if (guardians.length === 0) return []

  const { data: links, error: linkError } = await supabase
    .from('student_guardians')
    .select('guardian_id, student_id')
    .eq('school_id', schoolId)
    .in('guardian_id', guardians.map((g) => g.id))
  if (linkError) throw linkError

  const linkRows = (links ?? []) as { guardian_id: string; student_id: string }[]
  const studentIds = Array.from(new Set(linkRows.map((l) => l.student_id)))
  const names = new Map<string, string>()
  if (studentIds.length > 0) {
    const { data: students, error: studentError } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('school_id', schoolId)
      .in('id', studentIds)
    if (studentError) throw studentError
    for (const s of (students ?? []) as { id: string; full_name: string }[]) names.set(s.id, s.full_name)
  }

  const byGuardian = new Map<string, string[]>()
  for (const link of linkRows) {
    const name = names.get(link.student_id)
    if (!name) continue
    byGuardian.set(link.guardian_id, [...(byGuardian.get(link.guardian_id) ?? []), name])
  }

  return guardians.map((guardian) => ({
    ...guardian,
    studentNames: (byGuardian.get(guardian.id) ?? []).sort((a, b) => a.localeCompare(b)),
  }))
}

/** Every guardian in the school, for the student form's picker. */
export async function fetchSchoolGuardians(schoolId: string): Promise<GuardianRow[]> {
  const { data, error } = await supabase
    .from('guardians')
    .select('*')
    .eq('school_id', schoolId)
    .order('full_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as GuardianRow[]
}

export async function createGuardian(schoolId: string, input: GuardianInput): Promise<string> {
  const { data, error } = await supabase
    .from('guardians')
    .insert({
      school_id: schoolId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('A guardian with those details already exists at this school.')
    throw error
  }
  return (data as { id: string }).id
}

/** What the database did, so the interface can say it plainly. */
export type GuardianLinkOutcome = 'linked' | 'linked_primary' | 'promoted' | 'relationship_updated' | 'already_linked'

/**
 * Links a guardian to a student, optionally as the primary contact.
 *
 * WHY THIS GOES THROUGH AN RPC (SYSTEM_ISSUES_LIST S2). student_guardians allows
 * ONE primary guardian per student, enforced by a partial unique index. This
 * function used to insert directly and swallow EVERY 23505:
 *
 *     if (error && error.code !== '23505') throw error
 *
 * so linking a second primary failed the index, the error was discarded, and the
 * page reported success while the guardian was linked to nobody. Making someone
 * primary means demoting whoever holds it, and those two writes must not be
 * separable from a browser, which is what link_guardian_to_student does in one
 * transaction. Nothing is swallowed now: a refusal reaches the caller.
 *
 * The relationship (C2) is stored on a new link; on an existing link a different
 * relationship replaces the stored one ('relationship_updated').
 *
 * Creating a guardian still does not give them an account. They can sign in, and
 * be messaged, only once an invitation is accepted.
 */
export async function linkGuardianToStudent(
  schoolId: string,
  studentId: string,
  guardianId: string,
  makePrimary = false,
  relationship: GuardianRelationship | null = null,
): Promise<GuardianLinkOutcome> {
  const { data, error } = await supabase.rpc('link_guardian_to_student', {
    p_school_id: schoolId,
    p_student_id: studentId,
    p_guardian_id: guardianId,
    p_make_primary: makePrimary,
    p_relationship: relationship,
  })
  if (error) throw error
  return data as GuardianLinkOutcome
}

/**
 * Creates a guardian and links them to a student in ONE transaction.
 *
 * Replaces createGuardian + linkGuardianToStudent for the "New guardian" path.
 * Two calls could leave a guardian row belonging to no student when the link
 * failed, which is how the orphan in S2 was created.
 */
export async function createAndLinkGuardian(
  schoolId: string,
  studentId: string,
  input: GuardianInput,
  makePrimary = false,
  relationship: GuardianRelationship | null = null,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_and_link_guardian', {
    p_school_id: schoolId,
    p_student_id: studentId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email,
    p_make_primary: makePrimary,
    p_relationship: relationship,
  })
  if (error) {
    if (error.code === '23505') throw new Error('A guardian with those details already exists at this school.')
    throw error
  }
  return data as string
}
