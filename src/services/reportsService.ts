// ---------------------------------------------------------------------------
// School-wide report reads. Phase 8 batch 8.
//
// The management reports screen aggregates across the whole school, which no
// earlier service needed: every teaching-records read so far was scoped to one
// class, one date or one child. These two reads are scoped to the caller's own
// school explicitly and select only the columns an aggregate needs.
//
// They are reached by management only. attendance_records and grade_records
// admit management through can_manage_class, so for a principal with
// scope_mode='selected' the rows arrive already narrowed to their campuses —
// decision 2 keeps the client campus-unaware, and RLS does the narrowing, the
// same relationship classService documents.
//
// Aggregation happens in the browser. For a school of a few thousand pupils
// that is a few thousand small rows per term, which is acceptable for a report
// screen. If schools grow past that, the right fix is a SQL view or RPC that
// aggregates server-side, recorded as a scaling note rather than built now.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import type { AttendanceStatus } from '@/types'

export type TeacherActivityKind = 'attendance' | 'grades' | 'homework'

export interface TeacherActivityEvent {
  actorId: string
  date: string
  kind: TeacherActivityKind
}

async function fetchPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await loadPage(offset, offset + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export async function fetchSchoolTeacherActivityEvents(
  schoolId: string,
  since: string,
): Promise<TeacherActivityEvent[]> {
  const [attendance, grades, homework] = await Promise.all([
    fetchPages<{ marked_by: string | null; marked_at: string }>((from, to) =>
      supabase
        .from('attendance_records')
        .select('marked_by, marked_at')
        .eq('school_id', schoolId)
        .gte('marked_at', since)
        .order('marked_at', { ascending: true })
        .range(from, to),
    ),
    fetchPages<{ recorded_by: string | null; recorded_at: string }>((from, to) =>
      supabase
        .from('grade_records')
        .select('recorded_by, recorded_at')
        .eq('school_id', schoolId)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .range(from, to),
    ),
    fetchPages<{ created_by: string | null; created_at: string }>((from, to) =>
      supabase
        .from('homework')
        .select('created_by, created_at')
        .eq('school_id', schoolId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, to),
    ),
  ])

  return [
    ...attendance.flatMap((row) => row.marked_by ? [{ actorId: row.marked_by, date: row.marked_at, kind: 'attendance' as const }] : []),
    ...grades.flatMap((row) => row.recorded_by ? [{ actorId: row.recorded_by, date: row.recorded_at, kind: 'grades' as const }] : []),
    ...homework.flatMap((row) => row.created_by ? [{ actorId: row.created_by, date: row.created_at, kind: 'homework' as const }] : []),
  ]
}

export interface AttendanceFact {
  classId: string
  status: AttendanceStatus
}

export interface GradeFact {
  classId: string
  subjectId: string
  score: number
  maxScore: number
}

export async function fetchSchoolAttendanceFacts(schoolId: string): Promise<AttendanceFact[]> {
  const rows = await fetchPages<{ id: string; class_id: string; status: AttendanceStatus }>((from, to) =>
    supabase
      .from('attendance_records')
      .select('id, class_id, status')
      .eq('school_id', schoolId)
      .order('id', { ascending: true })
      .range(from, to),
  )
  return rows.map((r) => ({
    classId: r.class_id,
    status: r.status,
  }))
}

export async function fetchSchoolGradeFacts(schoolId: string): Promise<GradeFact[]> {
  const rows = await fetchPages<{
    id: string
    class_id: string
    subject_id: string
    score: number
    max_score: number
  }>((from, to) =>
    supabase
      .from('grade_records')
      .select('id, class_id, subject_id, score, max_score')
      .eq('school_id', schoolId)
      .order('id', { ascending: true })
      .range(from, to),
  )
  return rows.map((r) => ({
    classId: r.class_id,
    subjectId: r.subject_id,
    score: Number(r.score),
    maxScore: Number(r.max_score),
  }))
}
