// ---------------------------------------------------------------------------
// Academic structure: academic years, terms, subjects. Phase 8 batch 2.
//
// TENANT SCOPING. Every query filters `.eq('school_id', schoolId)` explicitly
// rather than selecting the whole table and letting RLS narrow it. RLS is the
// boundary that makes a mistake safe; it is not the mechanism the application
// should depend on to be correct.
//
// HOW "CURRENT" IS DERIVED. The two are derived differently, because the schema
// expresses them differently, and the difference matters.
//
//   CURRENT ACADEMIC YEAR is a stored fact. academic_years.status carries
//   'upcoming' | 'active' | 'closed', and the database enforces at most one
//   active year per school with a partial unique index:
//
//     CREATE UNIQUE INDEX academic_years_school_id_active_idx
//       ON public.academic_years (school_id) WHERE status = 'active'
//
//   So the active year is read, never computed. Note that
//   schools.active_academic_year_id does NOT exist: Amendment 14 removed it
//   precisely so there is one source of truth. The mock's
//   SchoolSettings.academicYearId is a leftover of that removed column and is
//   not reintroduced here.
//
//   CURRENT TERM is NOT stored. public.terms has no status column, only name,
//   start_date, end_date and sort_order. The current term is therefore the term
//   of the active year whose date range contains today, evaluated in the
//   school's own timezone using the batch 0 calendar helpers.
//
//   Between terms — holidays — no term contains today and currentTerm is null.
//   That is reported honestly rather than papered over by snapping to the
//   nearest term, because the sensible fallback differs by screen and inventing
//   one rule here would hide the gap. Which term a new grade or fee defaults to
//   during a holiday is a real question for batches 5 and 6.
//
//   The mock's CURRENT_TERM = 'Term 1' is a hardcoded string with no
//   relationship to any date. It is not reconciled to; it is replaced.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import { todayInTimeZone } from '@/utils/schoolCalendar'

export interface AcademicYearRow {
  id: string
  school_id: string
  label: string
  start_date: string
  end_date: string
  status: 'upcoming' | 'active' | 'closed'
  created_at: string
  updated_at: string
}

export interface TermRow {
  id: string
  school_id: string
  academic_year_id: string
  name: string
  start_date: string
  end_date: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SubjectRow {
  id: string
  school_id: string
  name: string
  code: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function fetchAcademicYears(schoolId: string): Promise<AcademicYearRow[]> {
  const { data, error } = await supabase
    .from('academic_years')
    .select('*')
    .eq('school_id', schoolId)
    .order('start_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as AcademicYearRow[]
}

export async function fetchTerms(schoolId: string): Promise<TermRow[]> {
  const { data, error } = await supabase
    .from('terms')
    .select('*')
    .eq('school_id', schoolId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as TermRow[]
}

/**
 * Active subjects for a school.
 *
 * Built in batch 2 because the plan scopes subjects here and because the three
 * academic-structure tables are one cohesive service. NOTHING CONSUMES IT YET:
 * subjects appear in the interface only as free text on teachers, classes,
 * grades, homework and exams, and those records are connected in batches 3 to 5.
 * This exists so those batches reference one definition rather than each
 * deriving their own.
 */
export async function fetchSubjects(schoolId: string): Promise<SubjectRow[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as SubjectRow[]
}

const STANDARD_SCHOOL_SUBJECTS = [
  'Mathematics',
  'Science',
  'Arabic',
  'Af-Soomaali',
  'English',
  'Tarbiyo (Islamic teachings)',
  'Social Studies',
  'Information and Communication Technology (ICT)',
  'Physics',
  'Chemistry',
  'Biology',
  'Geography',
  'History',
] as const

/**
 * Ensures the school has the standard timetable subject choices.
 *
 * Existing school-specific subjects are preserved. Duplicate inserts are
 * ignored using the database's (school_id, name) unique constraint.
 */
export async function ensureStandardSchoolSubjects(schoolId: string): Promise<SubjectRow[]> {
  const { data, error: readError } = await supabase
    .from('subjects')
    .select('name')
    .eq('school_id', schoolId)

  if (readError) throw readError

  const existing = new Set(((data ?? []) as { name: string }[]).map((subject) => subject.name))
  const missing = STANDARD_SCHOOL_SUBJECTS.filter((name) => !existing.has(name))

  if (missing.length > 0) {
    const { error: insertError } = await supabase
      .from('subjects')
      .upsert(
        missing.map((name) => ({ school_id: schoolId, name, is_active: true })),
        { onConflict: 'school_id,name', ignoreDuplicates: true },
      )

    if (insertError) throw insertError
  }

  return fetchSubjects(schoolId)
}

// ===========================================================================
// WRITES — academic calendar. SYSTEM_ISSUES_LIST K1, K2, K5, M1.
// ===========================================================================
// Phase 8 batch 2 left this page read-only on purpose, because switching the
// active year was two statements a browser cannot make atomic. Migration
// 20260916000003 supplies what was missing:
//
//   activate_academic_year   closes the outgoing year, activates the new one,
//                            and ends the outgoing year's open enrolments —
//                            one transaction, never a moment with no active year
//   seven validation guards  a term inside its year and not overlapping another,
//                            years not overlapping, no writes into a closed
//                            year, attendance inside its class's year, grades
//                            and exams on their class's own terms
//
// The guards raise PT422 with a sentence already written for a person, so
// calendarError passes the database's own message through rather than
// re-wording it here; the rule lives in one place.

function calendarError(error: { code?: string; message: string }): Error {
  if (error.code === 'PT422') return new Error(error.message)
  if (error.code === '23505') {
    return new Error(
      /terms/i.test(error.message)
        ? 'That term name is already used in this academic year.'
        : 'An academic year with that label already exists at this school.',
    )
  }
  if (error.code === '23514') return new Error('The end date must be after the start date.')
  if (error.code === '42501') return new Error('Only school management can change the academic calendar.')
  return new Error(error.message)
}

export interface AcademicYearInput {
  label: string
  startDate: string
  endDate: string
}

/**
 * Creates an academic year.
 *
 * A school's FIRST year is created already active, because there is nothing to
 * close and a school with no active year cannot create a single class. Every
 * later year is created 'upcoming', and becomes current only through
 * activateAcademicYear, so the switch always goes through the atomic function.
 */
export async function createAcademicYear(
  schoolId: string,
  input: AcademicYearInput,
  isFirstYear: boolean,
): Promise<AcademicYearRow> {
  const { data, error } = await supabase
    .from('academic_years')
    .insert({
      school_id: schoolId,
      label: input.label.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      status: isFirstYear ? 'active' : 'upcoming',
    })
    .select('*')
    .single()

  if (error) throw calendarError(error)
  return data as AcademicYearRow
}

export interface TermInput {
  academicYearId: string
  name: string
  startDate: string
  endDate: string
  sortOrder: number
}

export async function createTerm(schoolId: string, input: TermInput): Promise<void> {
  const { error } = await supabase.from('terms').insert({
    school_id: schoolId,
    academic_year_id: input.academicYearId,
    name: input.name.trim(),
    start_date: input.startDate,
    end_date: input.endDate,
    sort_order: input.sortOrder,
  })
  if (error) throw calendarError(error)
}

export interface YearActivation {
  outcome: 'switched' | 'already_active'
  activatedYearLabel: string
  previousYearLabel: string | null
  enrolmentsClosed: number
}

/**
 * Makes a year the active one, closing the current year and its open enrolments
 * in the same transaction (activate_academic_year). Management only; the
 * function checks that itself.
 */
export async function activateAcademicYear(schoolId: string, academicYearId: string): Promise<YearActivation> {
  const { data, error } = await supabase.rpc('activate_academic_year', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId,
  })
  if (error) throw calendarError(error)
  const r = data as {
    outcome: YearActivation['outcome']
    activated_year_label: string
    previous_year_label: string | null
    enrolments_closed: number
  }
  return {
    outcome: r.outcome,
    activatedYearLabel: r.activated_year_label,
    previousYearLabel: r.previous_year_label,
    enrolmentsClosed: r.enrolments_closed,
  }
}

/** The active academic year, or null when the school has not set one. */
export function activeAcademicYear(years: AcademicYearRow[]): AcademicYearRow | null {
  return years.find((year) => year.status === 'active') ?? null
}

/**
 * The term of the active year containing today in the school's timezone, or
 * null between terms. See the header for why null is returned rather than a
 * nearest-term guess.
 */
export function currentTerm(
  years: AcademicYearRow[],
  terms: TermRow[],
  timeZone: string,
): TermRow | null {
  const year = activeAcademicYear(years)
  if (!year) return null

  const today = todayInTimeZone(timeZone)
  return (
    terms.find(
      (term) => term.academic_year_id === year.id && term.start_date <= today && term.end_date >= today,
    ) ?? null
  )
}
