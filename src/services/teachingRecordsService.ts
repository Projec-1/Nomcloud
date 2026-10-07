// ---------------------------------------------------------------------------
// Teaching records. Phase 8 batch 5 — THE FIRST BATCH THAT WRITES.
//
// Tables: attendance_records, grade_records, homework, homework_submissions,
// exams. The access model is not invented here. It is the one RLS migration 12
// (20260912000005_teaching_records_rls.sql) already enforces, restated so the
// interface can offer only what the database will accept:
//
//   table                 teacher READ        teacher WRITE
//   --------------------  ------------------  ----------------------------
//   attendance_records    teaches_class       teaches_class      (class-level)
//   grade_records         teaches_class       teaches_class_subject (EXACT)
//   homework              teaches_class       teaches_class_subject (EXACT)
//   homework_submissions  teaches_homework_-  teaches_homework
//                         class
//   exams                 teaches_class       teaches_class_subject (EXACT)
//
// Management (owner, director, administrator, principal) goes through
// can_manage_class on every one of these, which is CLASS-level, never
// subject-exact. That asymmetry is why ClassSummary.writableSubjects exists and
// why it is built differently on the two sides. See teacherService.ts.
//
// THE ASYMMETRY THAT SHAPES THE SCREENS. A teacher READS their whole class's
// grades and WRITES only their own subjects. So the subject selector on a
// grading screen is not the class's subject list; it is writableSubjects. A
// homeroom-only teacher gets an empty selector and no score inputs at all,
// rather than a form whose Save silently does nothing.
//
// ---------------------------------------------------------------------------
// WHY THE SUBJECT RESTRICTION IS ENFORCED IN THE INTERFACE AND NOT LEFT TO RLS
// ---------------------------------------------------------------------------
// RLS filters rather than raises. A refused UPDATE reports zero rows and no
// error; only a refused INSERT reliably raises 42501. A screen that offered
// every subject of the class would therefore let a teacher type a column of
// marks for a subject they do not teach and, on Save, either see nothing happen
// or see a raw permission error. Both are bad, and neither tells them the real
// rule. The selector is narrowed instead, so the doomed write is never offered.
// RLS still refuses it independently if this code is ever wrong; that is the
// intended relationship, not a duplicate check.
//
// ---------------------------------------------------------------------------
// NO DERIVED COLUMNS HERE — VERIFIED, NOT ASSUMED
// ---------------------------------------------------------------------------
// fee_records.amount_paid is maintained by a trigger, which is why RLS batch 5
// needed a column grant and a SECURITY DEFINER trigger to protect it. Nothing of
// that kind applies to these five tables. The only triggers any of them carry
// are the generic `<table>_set_updated_at BEFORE UPDATE ... set_updated_at()`
// timestamp triggers — confirmed against pg_trigger, not assumed. There is no
// computed score, no maintained total, no counter. A direct write is the normal
// and only path, so these functions write the columns straight.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION IS TAKEN FROM THE SESSION, NEVER FROM A PROP
// ---------------------------------------------------------------------------
// attendance_records.marked_by, grade_records.recorded_by and
// homework.created_by are all FOREIGN KEYs to profiles(id) — the AUTH USER id.
// The policies check `col IS NULL OR col = auth.uid()`.
//
// The prototype passed `markedBy={activeMembership?.teacher_id}` into these
// screens. A teachers.id is a DIFFERENT uuid from the auth user id, so every one
// of those writes would have failed twice over: the foreign key would not
// resolve, and the policy comparison would not hold. The props are gone. These
// functions read the id from the live session, which is also the only value that
// can possibly satisfy auth.uid(), so no caller can get it wrong.
//
// TENANT SCOPING. Every read pins school_id plus an explicit id list. None asks
// broadly and lets RLS narrow it.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import type { AttendanceStatus } from '@/types'

/** The submission lifecycle, matching homework_submissions_status_check. */
export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'graded'

/** The exam lifecycle, matching exams_status_check. */
export type ExamStatus = 'scheduled' | 'completed' | 'cancelled'

/**
 * The signed-in auth user id, which is what auth.uid() returns inside a policy.
 *
 * Not the teachers.id, and not the memberships.id. See the attribution note
 * above — conflating them is the bug this function exists to prevent.
 */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// ===========================================================================
// ATTENDANCE
// ===========================================================================

export interface AttendanceEntry {
  studentId: string
  status: AttendanceStatus
  note: string | null
}

export interface AttendanceTrendEntry {
  date: string
  status: AttendanceStatus
}

export async function fetchAttendanceRange(
  schoolId: string,
  classId: string,
  fromDate: string,
  throughDate: string,
): Promise<AttendanceTrendEntry[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('date, status')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .gte('date', fromDate)
    .lte('date', throughDate)
    .order('date', { ascending: true })

  if (error) throw error
  return (data ?? []) as AttendanceTrendEntry[]
}

/**
 * One class's attendance for one date, as studentId -> entry.
 *
 * A student with no row is not absent; they are unmarked. The caller decides
 * what an unmarked student defaults to in the editor, and that default is not
 * persisted until someone saves.
 */
export async function fetchAttendance(
  schoolId: string,
  classId: string,
  date: string,
): Promise<Map<string, AttendanceEntry>> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('student_id, status, note')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('date', date)

  if (error) throw error

  const result = new Map<string, AttendanceEntry>()
  for (const row of (data ?? []) as { student_id: string; status: AttendanceStatus; note: string | null }[]) {
    result.set(row.student_id, { studentId: row.student_id, status: row.status, note: row.note })
  }
  return result
}

/**
 * Records attendance for a whole class on one date.
 *
 * UPSERT TARGET: attendance_records is UNIQUE (school_id, student_id, date).
 * Note what is NOT in that key — class_id. The schema allows a student exactly
 * one attendance row per day across the whole school, so re-marking replaces the
 * existing row rather than adding a second one. That is what makes saving the
 * same day twice idempotent instead of an error.
 *
 * It also has a consequence worth stating plainly: a student enrolled in two
 * classes cannot hold different attendance in each on the same day, and a
 * teacher of the second class attempting it is refused by the UPDATE policy,
 * which tests the EXISTING row's class_id. That is a schema-level decision from
 * Phase 3, not something this batch can resolve; it is recorded as an open
 * question rather than worked around here.
 */
/** What a register save achieved: everyone was saved except these pupils. */
export interface AttendanceSaveResult {
  refusedStudentIds: string[]
}

/**
 * Saves a class register for one date.
 *
 * ONE PUPIL MUST NOT SINK THE WHOLE REGISTER (SYSTEM_ISSUES_LIST M8). The
 * register is saved as a single upsert, and attendance is one row per pupil per
 * day across ALL classes. When a pupil moves class during a day, the morning's
 * register already holds their row under the old class; the new class's teacher
 * does not teach that class, so the database correctly refuses to overwrite it
 * (42501). As one statement, that refusal used to discard every other pupil's
 * mark too. Now a 42501 on a multi-pupil save is retried pupil by pupil: the
 * rest of the class is saved, and the pupils the database refused are returned
 * so the screen can name them. Nothing is widened — the refused pupil stays
 * refused, and the school office (which manages every class) can correct it.
 */
export async function saveAttendance(
  schoolId: string,
  classId: string,
  date: string,
  entries: AttendanceEntry[],
): Promise<AttendanceSaveResult> {
  if (entries.length === 0) return { refusedStudentIds: [] }

  const markedBy = await currentUserId()

  // K3, S11: the teacher policies require an OPEN enrolment in this class and
  // marked_by = auth.uid() — the live session id, never NULL, never another
  // person's. K4: the date must fall inside the class's academic year.
  const rows = entries.map((e) => ({
    school_id: schoolId,
    class_id: classId,
    student_id: e.studentId,
    date,
    status: e.status,
    note: e.note,
    marked_by: markedBy,
  }))

  const upsert = (payload: typeof rows) =>
    supabase.from('attendance_records').upsert(payload, { onConflict: 'school_id,student_id,date' })

  const { error } = await upsert(rows)
  if (!error) return { refusedStudentIds: [] }

  if (error.code === '42501' && rows.length > 1) {
    const refusedStudentIds: string[] = []
    for (const row of rows) {
      const { error: rowError } = await upsert([row])
      if (!rowError) continue
      if (rowError.code === '42501') {
        refusedStudentIds.push(row.student_id)
        continue
      }
      throw attendanceError(rowError)
    }
    if (refusedStudentIds.length === rows.length) throw attendanceError(error)
    return { refusedStudentIds }
  }

  throw attendanceError(error)
}

function attendanceError(error: { code?: string; message: string }): Error {
  if (error.code === '42501') {
    return new Error(
      'Attendance can only be marked for pupils currently enrolled in this class, and only by a teacher of it.',
    )
  }
  if (error.code === 'PT409' || error.code === 'PT422') return new Error(error.message)
  return new Error(error.message)
}

// ===========================================================================
// GRADES
// ===========================================================================

export interface GradeEntry {
  studentId: string
  score: number
  maxScore: number
}

export interface ClassGradeReportEntry extends GradeEntry {
  subjectId: string
  subjectName: string
  termId: string
  assessment: string
}

/**
 * Every recorded score for one class across the requested academic terms.
 * The query is school-, class-, and term-scoped and paginated to avoid silently
 * truncating larger classes at the PostgREST row limit.
 */
export async function fetchClassGradeReport(
  schoolId: string,
  classId: string,
  termIds: string[],
): Promise<ClassGradeReportEntry[]> {
  if (termIds.length === 0) return []

  const pageSize = 1000
  const rawRows: Omit<ClassGradeReportEntry, 'subjectName'>[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('grade_records')
      .select('student_id, subject_id, term_id, assessment, score, max_score')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .in('term_id', termIds)
      .order('student_id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error

    const rows = (data ?? []) as {
      student_id: string
      subject_id: string
      term_id: string
      assessment: string
      score: number
      max_score: number
    }[]
    rawRows.push(
      ...rows.map((row) => ({
        studentId: row.student_id,
        subjectId: row.subject_id,
        termId: row.term_id,
        assessment: row.assessment,
        score: Number(row.score),
        maxScore: Number(row.max_score),
      })),
    )
    if (rows.length < pageSize) break
  }

  const subjectIds = Array.from(new Set(rawRows.map((row) => row.subjectId)))
  const { data: subjects, error: subjectsError } = subjectIds.length
    ? await supabase.from('subjects').select('id, name').eq('school_id', schoolId).in('id', subjectIds)
    : { data: [], error: null }
  if (subjectsError) throw subjectsError
  const names = new Map(((subjects ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]))
  return rawRows.map((row) => ({ ...row, subjectName: names.get(row.subjectId) ?? row.subjectId }))
}

export interface ClassAttendanceReportEntry {
  studentId: string
  date: string
  status: AttendanceStatus
  note: string | null
}

export async function fetchClassAttendanceReport(
  schoolId: string,
  classId: string,
  fromDate: string,
  throughDate: string,
): Promise<ClassAttendanceReportEntry[]> {
  const pageSize = 1000
  const result: ClassAttendanceReportEntry[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('student_id, date, status, note')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .gte('date', fromDate)
      .lte('date', throughDate)
      .order('date', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error

    const rows = (data ?? []) as { student_id: string; date: string; status: AttendanceStatus; note: string | null }[]
    result.push(...rows.map((row) => ({
      studentId: row.student_id,
      date: row.date,
      status: row.status,
      note: row.note,
    })))
    if (rows.length < pageSize) return result
  }
}

/**
 * One assessment's scores, as studentId -> entry.
 *
 * Scoped by the full natural key minus the student, so the result is exactly the
 * column the grading screen is editing.
 */
export async function fetchGrades(
  schoolId: string,
  classId: string,
  subjectId: string,
  termId: string,
  assessment: string,
): Promise<Map<string, GradeEntry>> {
  const { data, error } = await supabase
    .from('grade_records')
    .select('student_id, score, max_score')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .eq('assessment', assessment)

  if (error) throw error

  const result = new Map<string, GradeEntry>()
  for (const row of (data ?? []) as { student_id: string; score: number; max_score: number }[]) {
    result.set(row.student_id, {
      studentId: row.student_id,
      score: Number(row.score),
      maxScore: Number(row.max_score),
    })
  }
  return result
}

/**
 * Records scores for one (class, subject, term, assessment).
 *
 * UPSERT TARGET: grade_records is
 * UNIQUE (school_id, student_id, subject_id, term_id, assessment), so correcting
 * a mark is the same call as entering it.
 *
 * The caller must have obtained `subjectId` from ClassSummary.writableSubjects.
 * Passing a subject the signed-in user does not teach is refused by
 * teaches_class_subject in the INSERT policy with SQLSTATE 42501, which is the
 * one RLS refusal that does raise — so a mistake here surfaces rather than
 * vanishing.
 *
 * grade_records_score_check enforces 0 <= score <= max_score in the database.
 * The caller clamps for a better message; the constraint is what guarantees it.
 */
export async function saveGrades(
  schoolId: string,
  classId: string,
  subjectId: string,
  termId: string,
  assessment: string,
  entries: GradeEntry[],
): Promise<void> {
  if (entries.length === 0) return

  const recordedBy = await currentUserId()

  // GROUP A (SYSTEM_ISSUES_LIST S10): subject-exact teaching AND an open
  // enrolment in the class.
  const { error } = await supabase.from('grade_records').upsert(
    entries.map((e) => ({
      school_id: schoolId,
      class_id: classId,
      student_id: e.studentId,
      subject_id: subjectId,
      term_id: termId,
      assessment,
      score: e.score,
      max_score: e.maxScore,
      recorded_by: recordedBy,
    })),
    { onConflict: 'school_id,student_id,subject_id,term_id,assessment' },
  )

  if (error) {
    if (error.code === '42501') {
      throw new Error(
        'Marks can only be recorded for pupils currently enrolled in this class, in a subject you teach.',
      )
    }
    throw error
  }

  if (error) throw error
}

// ===========================================================================
// HOMEWORK
// ===========================================================================

export interface HomeworkView {
  id: string
  classId: string
  subjectId: string
  subjectName: string
  title: string
  description: string | null
  assignedDate: string
  dueDate: string
  /** Submission rows that exist. A student with no row is `pending`. */
  submissions: { studentId: string; status: SubmissionStatus }[]
}

export interface NewHomework {
  classId: string
  subjectId: string
  title: string
  description: string
  assignedDate: string
  dueDate: string
}

/**
 * Homework for the given classes, newest due date first, with submissions.
 *
 * NO SUBMISSION ROWS ARE CREATED WHEN HOMEWORK IS ASSIGNED. Nothing in the
 * schema does it — there is no trigger — and inserting one row per enrolled
 * student at assignment time would be a bulk write whose only purpose is to
 * store the word "pending". Absence means pending instead, which is why
 * `submissions` here carries only the rows that exist and the board fills in the
 * rest from the roster it already has.
 */
export async function fetchHomework(schoolId: string, classIds: string[]): Promise<HomeworkView[]> {
  if (classIds.length === 0) return []

  const { data, error } = await supabase
    .from('homework')
    .select('id, class_id, subject_id, title, description, assigned_date, due_date')
    .eq('school_id', schoolId)
    .in('class_id', classIds)
    .order('due_date', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    class_id: string
    subject_id: string
    title: string
    description: string | null
    assigned_date: string
    due_date: string
  }[]
  if (rows.length === 0) return []

  // Two further scoped reads rather than embedded selects: homework_submissions
  // reaches homework through a COMPOSITE foreign key, (school_id, homework_id),
  // and a silent PostgREST embedding failure across one would look exactly like
  // "nobody has submitted anything".
  const homeworkIds = rows.map((r) => r.id)
  const subjectIds = Array.from(new Set(rows.map((r) => r.subject_id)))

  const [subs, subjects] = await Promise.all([
    supabase
      .from('homework_submissions')
      .select('homework_id, student_id, status')
      .eq('school_id', schoolId)
      .in('homework_id', homeworkIds),
    supabase.from('subjects').select('id, name').eq('school_id', schoolId).in('id', subjectIds),
  ])

  if (subs.error) throw subs.error
  if (subjects.error) throw subjects.error

  const subjectNames = new Map<string, string>()
  for (const s of (subjects.data ?? []) as { id: string; name: string }[]) subjectNames.set(s.id, s.name)

  const byHomework = new Map<string, { studentId: string; status: SubmissionStatus }[]>()
  for (const row of (subs.data ?? []) as { homework_id: string; student_id: string; status: SubmissionStatus }[]) {
    byHomework.set(row.homework_id, [
      ...(byHomework.get(row.homework_id) ?? []),
      { studentId: row.student_id, status: row.status },
    ])
  }

  return rows.map((r) => ({
    id: r.id,
    classId: r.class_id,
    subjectId: r.subject_id,
    subjectName: subjectNames.get(r.subject_id) ?? '',
    title: r.title,
    description: r.description,
    assignedDate: r.assigned_date,
    dueDate: r.due_date,
    submissions: byHomework.get(r.id) ?? [],
  }))
}

/** Assigns homework. subjectId must come from ClassSummary.writableSubjects. */
export async function createHomework(schoolId: string, input: NewHomework): Promise<void> {
  const createdBy = await currentUserId()

  const { error } = await supabase.from('homework').insert({
    school_id: schoolId,
    class_id: input.classId,
    subject_id: input.subjectId,
    title: input.title,
    description: input.description || null,
    assigned_date: input.assignedDate,
    due_date: input.dueDate,
    created_by: createdBy,
  })

  if (error) throw error
}

/**
 * Removes homework.
 *
 * Homework is the ONE table in this batch where a teacher holds DELETE, and only
 * for a subject they teach (homework_teacher_delete USING teaches_class_subject).
 * Attendance, grades, exams and submissions have no teacher DELETE policy at
 * all, which is why no delete control is offered on those screens.
 *
 * Submissions go with it through ON DELETE CASCADE on the composite key.
 */
export async function deleteHomework(schoolId: string, homeworkId: string): Promise<void> {
  const { error } = await supabase
    .from('homework')
    .delete()
    .eq('school_id', schoolId)
    .eq('id', homeworkId)

  if (error) throw error
}

/**
 * Marks one student's submission state.
 *
 * An upsert, because absence means pending: the first time a teacher moves a
 * student off pending there is no row yet.
 *
 * Decision 4 of RLS batch 4 stands — guardians do NOT submit homework. Homework
 * is physical and the teacher records it in person. Nothing in this module
 * offers a guardian write path, and the parent screen calls none of it.
 */
export async function setSubmissionStatus(
  schoolId: string,
  homeworkId: string,
  studentId: string,
  status: SubmissionStatus,
): Promise<void> {
  // GROUP A (SYSTEM_ISSUES_LIST S10): the pupil must be enrolled in the class
  // the homework was set for.
  const { error } = await supabase.from('homework_submissions').upsert(
    {
      school_id: schoolId,
      homework_id: homeworkId,
      student_id: studentId,
      status,
      submitted_at: status === 'pending' ? null : new Date().toISOString(),
    },
    { onConflict: 'school_id,homework_id,student_id' },
  )

  if (error) {
    if (error.code === '42501') {
      throw new Error('A submission can only be recorded for a pupil enrolled in this homework\'s class.')
    }
    throw error
  }

  if (error) throw error
}

// ===========================================================================
// EXAMS
// ===========================================================================

export interface ExamView {
  id: string
  classId: string
  subjectId: string
  subjectName: string
  termId: string
  name: string
  examDate: string
  startTime: string | null
  durationMinutes: number | null
  maxScore: number | null
  status: ExamStatus
  room: string | null
}

export interface ExamInput {
  classId: string
  subjectId: string
  termId: string
  name: string
  examDate: string
  startTime: string | null
  durationMinutes: number | null
  maxScore: number | null
  status: ExamStatus
  room: string | null
}

/** Exams for the given classes, earliest first. */
export async function fetchExams(schoolId: string, classIds: string[]): Promise<ExamView[]> {
  if (classIds.length === 0) return []

  const { data, error } = await supabase
    .from('exams')
    .select('id, class_id, subject_id, term_id, name, exam_date, start_time, duration_minutes, max_score, status, room')
    .eq('school_id', schoolId)
    .in('class_id', classIds)
    .order('exam_date', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    class_id: string
    subject_id: string
    term_id: string
    name: string
    exam_date: string
    start_time: string | null
    duration_minutes: number | null
    max_score: number | null
    status: ExamStatus
    room: string | null
  }[]
  if (rows.length === 0) return []

  const subjectIds = Array.from(new Set(rows.map((r) => r.subject_id)))
  const { data: subjects, error: subjectError } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('school_id', schoolId)
    .in('id', subjectIds)

  if (subjectError) throw subjectError
  const subjectNames = new Map<string, string>()
  for (const s of (subjects ?? []) as { id: string; name: string }[]) subjectNames.set(s.id, s.name)

  return rows.map((r) => ({
    id: r.id,
    classId: r.class_id,
    subjectId: r.subject_id,
    subjectName: subjectNames.get(r.subject_id) ?? '',
    termId: r.term_id,
    name: r.name,
    examDate: r.exam_date,
    startTime: r.start_time ? r.start_time.slice(0, 5) : null,
    durationMinutes: r.duration_minutes,
    maxScore: r.max_score === null ? null : Number(r.max_score),
    status: r.status,
    room: r.room,
  }))
}

/**
 * Schedules an exam.
 *
 * exams.status is NOT NULL with no default and a CHECK limiting it to
 * scheduled / completed / cancelled, so it is always sent explicitly. term_id is
 * NOT NULL too, which is why the screen requires a term before it will save
 * rather than guessing one.
 */
export async function createExam(schoolId: string, input: ExamInput): Promise<void> {
  const { error } = await supabase.from('exams').insert({
    school_id: schoolId,
    class_id: input.classId,
    subject_id: input.subjectId,
    term_id: input.termId,
    name: input.name,
    exam_date: input.examDate,
    start_time: input.startTime,
    duration_minutes: input.durationMinutes,
    max_score: input.maxScore,
    status: input.status,
    room: input.room,
  })

  if (error) throw error
}

export async function updateExam(schoolId: string, examId: string, input: ExamInput): Promise<void> {
  const { error } = await supabase
    .from('exams')
    .update({
      class_id: input.classId,
      subject_id: input.subjectId,
      term_id: input.termId,
      name: input.name,
      exam_date: input.examDate,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      max_score: input.maxScore,
      status: input.status,
      room: input.room,
    })
    .eq('school_id', schoolId)
    .eq('id', examId)

  if (error) throw error
}

/**
 * Cancels an exam by removing it.
 *
 * Management only. exams has no teacher DELETE policy, so a teacher reaching
 * this would get zero rows affected and no error — which is why the delete
 * control is rendered only where the signed-in user can manage the class.
 */
export async function deleteExam(schoolId: string, examId: string): Promise<void> {
  const { error } = await supabase.from('exams').delete().eq('school_id', schoolId).eq('id', examId)

  if (error) throw error
}

// ===========================================================================
// GUARDIAN READS
// ===========================================================================
// Read-only, by design. Decision 4 of RLS batch 4: guardians do not submit
// homework and get no write path anywhere in this batch. These three functions
// are scoped by student, which is the shape the guardian policies use
// (is_guardian_of_student) rather than the class-shaped teacher policies.

export interface ChildAttendanceRecord {
  date: string
  status: AttendanceStatus
  note: string | null
}

/** One child's attendance, most recent first. */
export async function fetchChildAttendance(
  schoolId: string,
  studentId: string,
): Promise<ChildAttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('date, status, note')
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .order('date', { ascending: false })

  if (error) throw error
  return (data ?? []) as ChildAttendanceRecord[]
}

export interface ChildGradeRecord {
  id: string
  subjectName: string
  termName: string
  assessment: string
  score: number
  maxScore: number
  recordedAt: string
}

/** One child's grades, with subject and term resolved to names. */
export async function fetchChildGrades(schoolId: string, studentId: string): Promise<ChildGradeRecord[]> {
  const { data, error } = await supabase
    .from('grade_records')
    .select('id, subject_id, term_id, assessment, score, max_score, recorded_at')
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .order('recorded_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    subject_id: string
    term_id: string
    assessment: string
    score: number
    max_score: number
    recorded_at: string
  }[]
  if (rows.length === 0) return []

  const [subjects, terms] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .in('id', Array.from(new Set(rows.map((r) => r.subject_id)))),
    supabase
      .from('terms')
      .select('id, name')
      .eq('school_id', schoolId)
      .in('id', Array.from(new Set(rows.map((r) => r.term_id)))),
  ])

  if (subjects.error) throw subjects.error
  if (terms.error) throw terms.error

  const subjectNames = new Map<string, string>()
  for (const s of (subjects.data ?? []) as { id: string; name: string }[]) subjectNames.set(s.id, s.name)
  const termNames = new Map<string, string>()
  for (const t of (terms.data ?? []) as { id: string; name: string }[]) termNames.set(t.id, t.name)

  return rows.map((r) => ({
    id: r.id,
    subjectName: subjectNames.get(r.subject_id) ?? '',
    termName: termNames.get(r.term_id) ?? '',
    assessment: r.assessment,
    score: Number(r.score),
    maxScore: Number(r.max_score),
    recordedAt: r.recorded_at,
  }))
}

export interface ChildHomeworkItem {
  id: string
  subjectName: string
  title: string
  description: string | null
  assignedDate: string
  dueDate: string
  status: SubmissionStatus
}

/**
 * One child's homework for the class they are enrolled in.
 *
 * The guardian policy on homework is guardian_has_student_in_class, which is
 * class-shaped, so this takes the classId the caller already resolved through
 * class_enrollments. Status comes from the child's own submission row, and
 * absence means pending for the same reason as on the teacher side.
 */
export async function fetchChildHomework(
  schoolId: string,
  classId: string,
  studentId: string,
): Promise<ChildHomeworkItem[]> {
  const { data, error } = await supabase
    .from('homework')
    .select('id, subject_id, title, description, assigned_date, due_date')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .order('due_date', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    subject_id: string
    title: string
    description: string | null
    assigned_date: string
    due_date: string
  }[]
  if (rows.length === 0) return []

  const [subs, subjects] = await Promise.all([
    supabase
      .from('homework_submissions')
      .select('homework_id, status')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .in('homework_id', rows.map((r) => r.id)),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .in('id', Array.from(new Set(rows.map((r) => r.subject_id)))),
  ])

  if (subs.error) throw subs.error
  if (subjects.error) throw subjects.error

  const statusByHomework = new Map<string, SubmissionStatus>()
  for (const s of (subs.data ?? []) as { homework_id: string; status: SubmissionStatus }[]) {
    statusByHomework.set(s.homework_id, s.status)
  }
  const subjectNames = new Map<string, string>()
  for (const s of (subjects.data ?? []) as { id: string; name: string }[]) subjectNames.set(s.id, s.name)

  return rows.map((r) => ({
    id: r.id,
    subjectName: subjectNames.get(r.subject_id) ?? '',
    title: r.title,
    description: r.description,
    assignedDate: r.assigned_date,
    dueDate: r.due_date,
    status: statusByHomework.get(r.id) ?? 'pending',
  }))
}
