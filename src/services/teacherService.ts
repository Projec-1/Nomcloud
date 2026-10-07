// ---------------------------------------------------------------------------
// Teacher to class resolution. Phase 8 batch 4.
//
// THIS FILE IS THE SECOND HALF OF THE FIX FOR PLAN SECTION A.4.
//
// The bug, identical in shape to the one batch 3 fixed on the parent side:
// seven teacher pages resolved their classes with
//
//   classes.filter((c) => c.teacherId === activeMembership?.teacher_id)
//
// where classes[].teacherId is 't1'..'t8' from the prototype seed and
// activeMembership.teacher_id is a UUID. The comparison never matched, so a real
// signed-in teacher saw an empty dashboard, an empty class list, and empty
// everything else.
//
// HOW "WHICH TEACHER IS THIS" IS RESOLVED NOW. The same chain batch 3 used,
// with teacher_id in place of guardian_id:
//
//   auth.uid()
//     -> memberships row with role = 'teacher'           (AuthContext)
//     -> memberships.teacher_id                           a real teachers.id
//     -> classes / class_subjects                         the assignments
//
// memberships.teacher_id is a composite foreign key,
// (school_id, teacher_id) -> teachers (school_id, id), written by
// accept_invitation when the teacher redeemed their invitation. The positive
// role/identity CHECK on memberships guarantees teacher_id is present exactly
// when role = 'teacher', so a non-teacher membership yields null.
//
// ---------------------------------------------------------------------------
// "ASSIGNED TO TEACH" — REUSED, NOT RE-DERIVED
// ---------------------------------------------------------------------------
// The definition is the one established in RLS batch 3 (migration
// 20260912000004) and reused unchanged by RLS batch 4 (20260912000005):
//
//   a teacher is assigned to class C when their teachers.id appears in
//     classes.class_teacher_id      for C            (homeroom), OR
//     class_subjects.teacher_id     for any subject of C
//
//   and NEVER in timetable_slots.teacher_id.
//
// The timetable exclusion is not a preference. Slot visibility is itself derived
// from teaching the class, so deriving the assignment from the slot would make
// each grant the other. That circularity was the reason for the exclusion when
// it was first settled, and nothing here revisits it. A cover teacher still
// reads their own slot through a separate own-slot policy without that slot
// counting as an assignment.
//
// The authoritative copy of this definition is public.teaches_class(uuid, uuid),
// a SECURITY DEFINER function. The queries below express the same two arms and
// the same exclusion, because a policy helper cannot be used as a client-side
// filter without one round trip per class. RLS enforces teaches_class
// independently on every read, so if the two ever disagreed the database would
// narrow the result, never widen it. That is the intended relationship: this
// code decides what to ask for, RLS decides what may be answered.
//
// TENANT SCOPING. Every query filters school_id and a specific id set. None asks
// broadly and lets RLS narrow it.
//
// WHY SEPARATE QUERIES RATHER THAN EMBEDDED SELECTS. The same reason batch 3
// gave: these tables reach one another through COMPOSITE foreign keys, and a
// silent PostgREST embedding failure would look exactly like "this teacher has
// no classes", which is the bug being fixed.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'

export interface TeacherRow {
  id: string
  school_id: string
  full_name: string
  email: string | null
  phone: string | null
  staff_no: string | null
  primary_subject_id: string | null
  status: string
  joined_date: string
  created_at: string
  updated_at: string
}

/**
 * A class as the teacher screens render it.
 *
 * A view model, not a row. `id` is the real classes.id UUID. Field names are
 * kept close to the mock `SchoolClass` so this batch changes identity
 * resolution without also rewriting seven pages' markup.
 *
 * `studentIds` comes from class_enrollments, not from a column: a roster is a
 * time-scoped relation, which is why SCHEMA_DESIGN gives students no class_id.
 * `subject` carries subject NAMES resolved through class_subjects, replacing the
 * mock's free-text string array.
 */
export interface ClassSummary {
  id: string
  academicYearId: string
  name: string
  grade: string
  section: string | null
  room: string | null
  capacity: number | null
  /** classes.class_teacher_id, the homeroom teacher. Null when unassigned. */
  teacherId: string | null
  studentIds: string[]
  /** Every subject taught in this class, by name. */
  subject: string[]
  /**
   * The subjects the SIGNED-IN USER may record against in THIS class.
   *
   * Phase 8 batch 5. This is what lets the interface enforce subject-exact
   * access itself rather than offering a field and letting RLS reject the write
   * silently. RLS migration 12 made grade, homework and exam writes require the
   * exact (class, subject) pair through teaches_class_subject; a UI that offered
   * every subject of the class would invite a teacher to type marks that were
   * always going to be refused, and a refused write is not visible to them,
   * because RLS filters rather than raises.
   *
   * For a teacher this is their own class_subjects rows, so it is a SUBSET of
   * `subject`. For management it is every subject of the class, because the
   * matching policies key on can_manage_class, which is class-level rather than
   * subject-exact. classService builds the management case; this file builds the
   * teacher case. One field, one meaning on both sides: what you may write here.
   *
   * Empty for a homeroom-only teacher who teaches none of the class's subjects.
   * That teacher can still mark attendance, which is class-level, but has no
   * subject to enter marks against — exactly the split RLS batch 4 recorded.
   */
  writableSubjects: { id: string; name: string }[]
}

/** A timetable slot shaped for TimetableGrid, which batch 0 moved to ISO days. */
export interface TimetableSlotView {
  id: string
  classId: string
  teacherId: string
  subjectId: string | null
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7
  period: number
  startTime: string
  endTime: string
  subject: string
  teacherName?: string
  room: string
}

export interface TeacherWorkspace {
  teacher: TeacherRow | null
  classes: ClassSummary[]
  timetable: TimetableSlotView[]
}

/** The signed-in teacher's own teachers row. */
export async function fetchTeacher(schoolId: string, teacherId: string): Promise<TeacherRow | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('school_id', schoolId)
    .eq('id', teacherId)
    .maybeSingle()

  if (error) throw error
  return (data as TeacherRow | null) ?? null
}

/**
 * The ids of every class this teacher is assigned to.
 *
 * Two arms, unioned, exactly as the definition above states. Arm one is the
 * homeroom link on classes; arm two is the subject link on class_subjects.
 * timetable_slots is deliberately not consulted.
 */
async function fetchAssignedClassIds(schoolId: string, teacherId: string): Promise<string[]> {
  const [homeroom, subjects] = await Promise.all([
    supabase.from('classes').select('id').eq('school_id', schoolId).eq('class_teacher_id', teacherId),
    supabase.from('class_subjects').select('class_id').eq('school_id', schoolId).eq('teacher_id', teacherId),
  ])

  if (homeroom.error) throw homeroom.error
  if (subjects.error) throw subjects.error

  const ids = new Set<string>()
  for (const row of homeroom.data ?? []) ids.add((row as { id: string }).id)
  for (const row of subjects.data ?? []) ids.add((row as { class_id: string }).class_id)
  return Array.from(ids)
}

/**
 * Everything the teacher workspace needs: the classes they teach, each class's
 * roster and subjects, and the timetable for those classes.
 *
 * Returns empty collections when the teacher has no assignments, which is a real
 * state — a teacher can exist before being given a class. The caller renders
 * that as `empty`, never as `denied`.
 */
export async function fetchTeacherWorkspace(
  schoolId: string,
  teacherId: string,
  /** K6: narrow to one academic year's classes; null shows every year. */
  academicYearId: string | null = null,
): Promise<TeacherWorkspace> {
  const teacher = await fetchTeacher(schoolId, teacherId)
  let classIds = await fetchAssignedClassIds(schoolId, teacherId)

  // Resolve the year filter FIRST, so the roster, subject and timetable reads
  // below are scoped to the same classes as the list itself.
  if (academicYearId && classIds.length > 0) {
    const { data, error } = await supabase
      .from('classes')
      .select('id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academicYearId)
      .in('id', classIds)
    if (error) throw error
    classIds = ((data ?? []) as { id: string }[]).map((c) => c.id)
  }

  if (classIds.length === 0) {
    return { teacher, classes: [], timetable: [] }
  }

  const [classRows, enrolments, classSubjects, slots, teacherRows] = await Promise.all([
    supabase.from('classes').select('*').eq('school_id', schoolId).in('id', classIds).order('name'),
    // left_on IS NULL is the available "still enrolled" signal. Plan section A.2
    // notes it is not a complete definition of "current", because rows can
    // remain open across academic years; tightening it needs the decision
    // recorded there and is not invented here.
    supabase
      .from('class_enrollments')
      .select('class_id, student_id')
      .eq('school_id', schoolId)
      .in('class_id', classIds)
      .is('left_on', null),
    supabase
      .from('class_subjects')
      .select('class_id, subject_id, teacher_id')
      .eq('school_id', schoolId)
      .in('class_id', classIds),
    supabase.from('timetable_slots').select('*').eq('school_id', schoolId).in('class_id', classIds),
    supabase.from('teachers').select('id, full_name').eq('school_id', schoolId),
  ])

  if (classRows.error) throw classRows.error
  if (enrolments.error) throw enrolments.error
  if (classSubjects.error) throw classSubjects.error
  if (slots.error) throw slots.error
  if (teacherRows.error) throw teacherRows.error

  const teacherNames = new Map(
    (teacherRows.data ?? []).map((row) => {
      const teacher = row as { id: string; full_name: string }
      return [teacher.id, teacher.full_name] as const
    }),
  )

  // Resolve subject ids to names in one further scoped query.
  const subjectIds = Array.from(
    new Set((classSubjects.data ?? []).map((r) => (r as { subject_id: string }).subject_id)),
  )
  const subjectNames = new Map<string, string>()
  if (subjectIds.length > 0) {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .in('id', subjectIds)
    if (error) throw error
    for (const row of data ?? []) {
      const s = row as { id: string; name: string }
      subjectNames.set(s.id, s.name)
    }
  }

  const rosterByClass = new Map<string, string[]>()
  for (const row of enrolments.data ?? []) {
    const e = row as { class_id: string; student_id: string }
    rosterByClass.set(e.class_id, [...(rosterByClass.get(e.class_id) ?? []), e.student_id])
  }

  const subjectsByClass = new Map<string, string[]>()
  const writableByClass = new Map<string, { id: string; name: string }[]>()
  for (const row of classSubjects.data ?? []) {
    const cs = row as { class_id: string; subject_id: string; teacher_id: string | null }
    const name = subjectNames.get(cs.subject_id)
    if (!name) continue
    subjectsByClass.set(cs.class_id, [...(subjectsByClass.get(cs.class_id) ?? []), name])
    // The subject-exact arm: only rows naming THIS teacher.
    if (cs.teacher_id === teacherId) {
      writableByClass.set(cs.class_id, [
        ...(writableByClass.get(cs.class_id) ?? []),
        { id: cs.subject_id, name },
      ])
    }
  }

  const classes: ClassSummary[] = (classRows.data ?? []).map((row) => {
    const c = row as {
      id: string
      academic_year_id: string
      name: string
      grade: string
      section: string | null
      room: string | null
      capacity: number | null
      class_teacher_id: string | null
    }
    return {
      id: c.id,
      academicYearId: c.academic_year_id,
      name: c.name,
      grade: c.grade,
      section: c.section,
      room: c.room,
      capacity: c.capacity,
      teacherId: c.class_teacher_id,
      studentIds: rosterByClass.get(c.id) ?? [],
      subject: (subjectsByClass.get(c.id) ?? []).sort(),
      writableSubjects: (writableByClass.get(c.id) ?? []).sort((x, y) => x.name.localeCompare(y.name)),
    }
  })

  const timetable: TimetableSlotView[] = (slots.data ?? []).map((row) => {
    const s = row as {
      id: string
      class_id: string
      teacher_id: string | null
      subject_id: string | null
      day_of_week: number
      period: number
      start_time: string
      end_time: string
      room: string | null
    }
    return {
      id: s.id,
      classId: s.class_id,
      teacherId: s.teacher_id ?? '',
      subjectId: s.subject_id ?? null,
      day: s.day_of_week as TimetableSlotView['day'],
      period: s.period,
      startTime: s.start_time.slice(0, 5),
      endTime: s.end_time.slice(0, 5),
      subject: s.subject_id ? (subjectNames.get(s.subject_id) ?? '') : '',
      teacherName: s.teacher_id ? teacherNames.get(s.teacher_id) : undefined,
      room: s.room ?? '',
    }
  })

  return { teacher, classes, timetable }
}

// ===========================================================================
// MANAGEMENT WRITES. Phase 8 batch 8.
// ===========================================================================
// teachers gates INSERT/UPDATE/DELETE on has_school_management_role. A teacher
// cannot create or edit a teachers row, including their own: staff records are
// administrative.

export interface TeacherInput {
  fullName: string
  email: string | null
  phone: string | null
  staffNo: string | null
  primarySubjectId: string | null
  status: string
  /**
   * Date of birth and gender are OPTIONAL PROPERTIES, not merely nullable ones.
   *
   * The bulk import supplies them when a school's staff file has those columns;
   * the teacher form does not offer them at all, because that screen's design is
   * not ours to change. Leaving a key out therefore has to mean "do not touch
   * this column" rather than "set it to null", or saving an edit in the form
   * would quietly erase what an import stored. The two writers below spread
   * these keys in only when the caller actually passed them.
   */
  dateOfBirth?: string | null
  gender?: string | null
}

/** Only the keys the caller actually supplied, so an omitted one is left alone. */
function optionalTeacherFields(input: TeacherInput): Record<string, string | null> {
  return {
    ...('dateOfBirth' in input ? { date_of_birth: input.dateOfBirth ?? null } : {}),
    ...('gender' in input ? { gender: input.gender ?? null } : {}),
  }
}

/** Every teacher in the school, for the management staff list. */
export async function fetchSchoolTeachers(schoolId: string): Promise<TeacherRow[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('school_id', schoolId)
    .order('full_name', { ascending: true })

  if (error) throw error
  return (data ?? []) as TeacherRow[]
}

export interface ClassSubjectAssignment {
  classId: string
  subjectId: string
  teacherId: string | null
}

export async function fetchSchoolClassSubjectAssignments(schoolId: string): Promise<ClassSubjectAssignment[]> {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('class_id, subject_id, teacher_id')
    .eq('school_id', schoolId)

  if (error) throw error
  return ((data ?? []) as { class_id: string; subject_id: string; teacher_id: string | null }[]).map((row) => ({
    classId: row.class_id,
    subjectId: row.subject_id,
    teacherId: row.teacher_id,
  }))
}

export async function saveTeacherClassSubjectAssignments(
  schoolId: string,
  teacherId: string,
  selected: { classId: string; subjectId: string }[],
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('class_subjects')
    .select('class_id, subject_id')
    .eq('school_id', schoolId)
    .eq('teacher_id', teacherId)

  if (readError) throw readError

  const current = (data ?? []) as { class_id: string; subject_id: string }[]
  const desiredKeys = new Set(selected.map(({ classId, subjectId }) => `${classId}:${subjectId}`))

  if (selected.length > 0) {
    const { error: writeError } = await supabase
      .from('class_subjects')
      .upsert(
        selected.map(({ classId, subjectId }) => ({
          school_id: schoolId,
          class_id: classId,
          subject_id: subjectId,
          teacher_id: teacherId,
        })),
        { onConflict: 'school_id,class_id,subject_id' },
      )

    if (writeError) throw writeError
  }

  const removed = current.filter(({ class_id, subject_id }) => !desiredKeys.has(`${class_id}:${subject_id}`))
  const results = await Promise.all(
    removed.map(({ class_id, subject_id }) =>
      supabase
        .from('class_subjects')
        .update({ teacher_id: null })
        .eq('school_id', schoolId)
        .eq('class_id', class_id)
        .eq('subject_id', subject_id)
        .eq('teacher_id', teacherId),
    ),
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

export async function createTeacher(schoolId: string, input: TeacherInput): Promise<string> {
  const { data, error } = await supabase
    .from('teachers')
    .insert({
      school_id: schoolId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      staff_no: input.staffNo,
      primary_subject_id: input.primarySubjectId,
      status: input.status,
      ...optionalTeacherFields(input),
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('That staff number or email is already used at this school.')
    throw error
  }
  return (data as { id: string }).id
}

export async function updateTeacher(schoolId: string, id: string, input: TeacherInput): Promise<void> {
  const { error } = await supabase
    .from('teachers')
    .update({
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      staff_no: input.staffNo,
      primary_subject_id: input.primarySubjectId,
      status: input.status,
      ...optionalTeacherFields(input),
    })
    .eq('school_id', schoolId)
    .eq('id', id)

  if (error) {
    if (error.code === '23505') throw new Error('That staff number or email is already used at this school.')
    throw error
  }
}

/**
 * Removes the teacher's EMPLOYMENT RECORD.
 *
 * Refused by the database (23503) while the teacher is the homeroom of a class,
 * named on a class_subjects row, or still holds a login. Migration
 * 20260916000001 made the membership and class_subjects links RESTRICT so that
 * deleting this row can no longer silently revoke someone's access or blank a
 * subject assignment (SYSTEM_ISSUES_LIST S3).
 *
 * To take away access only, use revokeAccess in accessService: it keeps the
 * employment record and its history.
 */
export async function deleteTeacher(schoolId: string, id: string): Promise<void> {
  const { error } = await supabase.from('teachers').delete().eq('school_id', schoolId).eq('id', id)
  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'This teacher still has a class or subject assigned, or an app login. Unassign their classes and remove their access first.',
      )
    }
    throw error
  }
}
