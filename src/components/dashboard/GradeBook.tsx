import { useCallback, useEffect, useState } from 'react'
import { FloppyDisk as Save, Lock, Printer, DownloadSimple } from '@phosphor-icons/react'
import { useToast } from '@/context/ToastContext'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Loader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import { useAcademicStructure } from '@/hooks/useAcademicStructure'
import type { ClassSummary } from '@/services/teacherService'
import { fetchRosterStudents, type RosterStudent } from '@/services/studentService'
import { fetchClassGradeReport, fetchGrades, saveGrades, type ClassGradeReportEntry, type GradeEntry } from '@/services/teachingRecordsService'
import { cn } from '@/utils/cn'
import { errorMessage } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Phase 8 batch 5. Reads and writes real grade_records.
//
// THIS SCREEN IS WHERE SUBJECT-EXACT ACCESS IS ENFORCED IN THE INTERFACE.
//
// grade_records_teacher_insert requires teaches_class_subject(school_id,
// class_id, subject_id) — the exact (class, subject) pair, established in RLS
// migration 12. A teacher READS the whole class's grades through
// grade_records_teacher_select (teaches_class, class-level) but may WRITE only
// their own subjects.
//
// So the subject selector is NOT selectedClass.subject, which is every subject
// taught in the class. It is selectedClass.writableSubjects, which for a teacher
// is only their own class_subjects rows and for management is every subject,
// matching can_manage_class being class-level. A homeroom-only teacher therefore
// sees an empty selector and NO SCORE INPUTS AT ALL, rather than a full form
// whose Save is refused.
//
// That distinction matters because RLS filters rather than raises. Offering the
// field and letting the database decide would, for an UPDATE, report zero rows
// and no error — the teacher would type a column of marks, press Save, see a
// success toast and lose the lot.
//
// WHY THE TERM IS A VISIBLE CONTROL. grade_records.term_id is NOT NULL and part
// of the natural key, UNIQUE (school_id, student_id, subject_id, term_id,
// assessment). The batch 2 academic hook resolves the current term by date and
// returns NULL between terms, so a hidden default would silently write into the
// wrong term or fail. The term is chosen explicitly, defaulted to the current
// one when there is one.
//
// NO DELETE CONTROL. grade_records has no teacher DELETE policy; only management
// can remove a mark, and no screen in this batch offers it.
// ---------------------------------------------------------------------------

const assessmentTypes = ['CAT 1', 'CAT 2', 'Mid-Term Exam', 'End-Term Exam', 'Assignment']

const MAX_SCORE = 100

function scoreToGrade(pct: number) {
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'A-'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C+'
  if (pct >= 40) return 'C'
  return 'D'
}

function gradeTone(grade: string) {
  if (grade.startsWith('A')) return 'text-emerald-600'
  if (grade.startsWith('B')) return 'text-accent'
  if (grade.startsWith('C')) return 'text-amber-600'
  return 'text-red-500'
}

interface GradeBookProps {
  classes: ClassSummary[]
  schoolId: string
  readOnly?: boolean
}

type ReportFormat = 'csv' | 'xlsx' | 'pdf'
type ReportScope = 'term' | 'year'

interface PrintableGradeReport {
  title: string
  className: string
  academicYear: string
  period: string
  records: {
    student: string
    subject: string
    term: string
    assessment: string
    score: string
  }[]
}

function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function GradeBook({ classes, schoolId, readOnly = false }: GradeBookProps) {
  const { showToast } = useToast()
  const { state: academicState } = useAcademicStructure()

  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const selectedClass = classes.find((c) => c.id === classId)

  // The writable set, not the class's full subject list. This one line is the
  // subject-exact restriction as the user experiences it.
  const writable = selectedClass?.writableSubjects ?? []

  const [subjectId, setSubjectId] = useState(writable[0]?.id ?? '')
  const [termId, setTermId] = useState('')
  const [assessment, setAssessment] = useState(assessmentTypes[0])
  const [students, setStudents] = useState<RosterStudent[]>([])
  const [scores, setScores] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [reportScope, setReportScope] = useState<ReportScope>('term')
  const [isExporting, setIsExporting] = useState(false)
  const [printReport, setPrintReport] = useState<PrintableGradeReport | null>(null)

  const terms = academicState.status === 'ready' ? academicState.data.terms : []
  const currentTermId = academicState.status === 'ready' ? (academicState.data.term?.id ?? '') : ''
  const academicYears = academicState.status === 'ready' ? academicState.data.years : []

  // Changing class re-anchors the subject, because the writable set is per class:
  // a teacher may teach Mathematics in one class and nothing in another.
  //
  // Keyed on the subject IDS rather than the array, so a re-render that hands
  // back an equal-but-new array does not silently reset a subject the user
  // chose. Only a genuine change of writable subjects re-anchors it.
  const writableKey = writable.map((s) => s.id).join(',')
  useEffect(() => {
    setSubjectId((current) => {
      if (current && writable.some((s) => s.id === current)) return current
      return writable[0]?.id ?? ''
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, writableKey])

  // Default to the term containing today, falling back to the most recent
  // defined term when today falls between terms.
  useEffect(() => {
    if (termId) return
    if (currentTermId) setTermId(currentTermId)
    else if (terms.length > 0) setTermId(terms[terms.length - 1].id)
  }, [currentTermId, terms, termId])

  useEffect(() => {
    if (!printReport) return
    const handleAfterPrint = () => setPrintReport(null)
    window.addEventListener('afterprint', handleAfterPrint)
    const frame = window.requestAnimationFrame(() => window.print())
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [printReport])

  useEffect(() => {
    let cancelled = false
    if (!selectedClass) {
      setStudents([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(false)
    const needsGrades = Boolean(subjectId && termId)

    Promise.all([
      fetchRosterStudents(schoolId, selectedClass.studentIds),
      needsGrades
        ? fetchGrades(schoolId, selectedClass.id, subjectId, termId, assessment)
        : Promise.resolve(new Map<string, GradeEntry>()),
    ])
      .then(([roster, existing]) => {
        if (cancelled) return
        setStudents(roster)
        const next: Record<string, string> = {}
        for (const s of roster) {
          const record = existing.get(s.id)
          next[s.id] = record ? String(record.score) : ''
        }
        setScores(next)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(true)
        showToast({
          type: 'error',
          title: 'Could not load grades',
          description: errorMessage(err),
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, selectedClass, subjectId, termId, assessment, showToast])

  const handleSave = useCallback(async () => {
    if (!selectedClass || !subjectId || !termId) return
    setIsSaving(true)

    const entries: GradeEntry[] = []
    for (const s of students) {
      const raw = scores[s.id]
      if (raw === undefined || raw.trim() === '') continue
      const parsed = Number(raw)
      if (Number.isNaN(parsed)) continue
      // grade_records_score_check enforces 0 <= score <= max_score in the
      // database. Clamping here only produces a better outcome than a raw
      // constraint violation; the constraint is what guarantees it.
      entries.push({ studentId: s.id, score: Math.max(0, Math.min(MAX_SCORE, parsed)), maxScore: MAX_SCORE })
    }

    if (entries.length === 0) {
      setIsSaving(false)
      showToast({ type: 'info', title: 'Nothing to save', description: 'Enter at least one score first.' })
      return
    }

    try {
      await saveGrades(schoolId, selectedClass.id, subjectId, termId, assessment, entries)
      const subjectName = writable.find((s) => s.id === subjectId)?.name ?? 'this subject'
      showToast({
        type: 'success',
        title: 'Grades saved',
        description: `${entries.length} grade${entries.length === 1 ? '' : 's'} recorded for ${subjectName}.`,
      })
    } catch (err: unknown) {
      // A subject this user does not teach raises 42501 here. Surfacing it is
      // the point: a silent success toast over a refused write is exactly the
      // failure this screen is designed to avoid.
      showToast({
        type: 'error',
        title: 'Grades not saved',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }, [selectedClass, subjectId, termId, assessment, students, scores, schoolId, writable, showToast])

  const handleExport = async (format: ReportFormat) => {
    const selectedTerm = terms.find((term) => term.id === termId)
    if (!selectedClass || !selectedTerm) return

    const reportTerms = reportScope === 'term'
      ? [selectedTerm]
      : terms.filter((term) => term.academic_year_id === selectedTerm.academic_year_id)
    if (reportTerms.length === 0) return

    setIsExporting(true)
    try {
      const entries = await fetchClassGradeReport(schoolId, selectedClass.id, reportTerms.map((term) => term.id))
      const studentNames = new Map(students.map((student) => [student.id, student.name]))
      const subjectNames = new Map(writable.map((subject) => [subject.id, subject.name]))
      const termNames = new Map(reportTerms.map((term) => [term.id, term.name]))
      const records = entries.map((entry: ClassGradeReportEntry) => ({
        student: studentNames.get(entry.studentId) ?? entry.studentId,
        subject: subjectNames.get(entry.subjectId) ?? entry.subjectId,
        term: termNames.get(entry.termId) ?? entry.termId,
        assessment: entry.assessment,
        score: entry.score,
        maxScore: entry.maxScore,
      }))
      const academicYear = academicYears.find((year) => year.id === selectedTerm.academic_year_id)?.label ?? 'Academic year'
      const period = reportScope === 'term' ? selectedTerm.name : 'Full academic year'
      const safeName = `${selectedClass.name}-${academicYear}-${period}`.replace(/[^a-z0-9-_]+/gi, '-')
      const reportHeaders = ['Student', 'Subject', 'Term', 'Assessment', 'Score', 'Maximum score', 'Percentage']
      const tableRows: (string | number)[][] = [
        reportHeaders,
        ...records.map((record) => [
          record.student,
          record.subject,
          record.term,
          record.assessment,
          record.score,
          record.maxScore,
          `${((record.score / record.maxScore) * 100).toFixed(1)}%`,
        ]),
      ]

      if (format === 'csv') {
        downloadCsv(`${safeName}.csv`, tableRows)
      } else if (format === 'xlsx') {
        const ExcelJS = (await import('exceljs')).default
        const workbook = new ExcelJS.Workbook()
        workbook.creator = 'Nom Cloud'
        workbook.created = new Date()
        const sheet = workbook.addWorksheet('Class grades')
        sheet.columns = reportHeaders.map((header) => ({
          header,
          key: header,
          width: Math.max(16, header.length + 4),
        }))
        records.forEach((record) => {
          sheet.addRow({
            Student: record.student,
            Subject: record.subject,
            Term: record.term,
            Assessment: record.assessment,
            Score: record.score,
            'Maximum score': record.maxScore,
            Percentage: record.maxScore ? record.score / record.maxScore : 0,
          })
        })
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9471B' } }
        sheet.views = [{ state: 'frozen', ySplit: 1 }]
        sheet.getColumn(7).numFmt = '0.0%'
        const buffer = await workbook.xlsx.writeBuffer()
        const url = URL.createObjectURL(new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }))
        const link = document.createElement('a')
        link.href = url
        link.download = `${safeName}.xlsx`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } else {
        setPrintReport({
          title: `${selectedClass.name} · ${period} grade report`,
          className: selectedClass.name,
          academicYear,
          period,
          records: records.map((record) => ({
            student: record.student,
            subject: record.subject,
            term: record.term,
            assessment: record.assessment,
            score: `${record.score} / ${record.maxScore} (${record.maxScore ? ((record.score / record.maxScore) * 100).toFixed(1) : '0.0'}%)`,
          })),
        })
      }
      showToast({ type: 'success', title: format === 'pdf' ? 'Print report ready' : 'Report exported', description: `${records.length} recorded scores included.` })
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Report not exported', description: errorMessage(err) })
    } finally {
      setIsExporting(false)
    }
  }

  // The homeroom-only case: assigned to the class, teaching none of its
  // subjects. Reading grades is allowed; writing any of them is not. Saying so
  // is better than an empty dropdown the user cannot explain.
  if (selectedClass && writable.length === 0) {
    return (
      <div>
        <ClassPicker classes={classes} classId={classId} onChange={setClassId} />
        <EmptyState
          icon={Lock}
          title="No subjects you can grade in this class"
          description="Marks are entered by the teacher assigned to each subject. You can still mark this class's attendance."
        />
      </div>
    )
  }

  const canSave = Boolean(selectedClass && subjectId && termId) && !isSaving && !isLoading
  const validScores = Object.entries(scores)
    .map(([studentId, raw]) => ({ studentId, score: Number(raw) }))
    .filter(({ studentId, score }) => scores[studentId]?.trim() !== '' && Number.isFinite(score) && score >= 0 && score <= MAX_SCORE)
  const averageScore = validScores.length
    ? validScores.reduce((sum, item) => sum + item.score, 0) / validScores.length
    : null
  const passedScores = validScores.filter((item) => item.score >= 50).length
  const scoreBands = [
    { label: '0–49%', value: validScores.filter((item) => item.score < 50).length },
    { label: '50–59%', value: validScores.filter((item) => item.score >= 50 && item.score < 60).length },
    { label: '60–69%', value: validScores.filter((item) => item.score >= 60 && item.score < 70).length },
    { label: '70–79%', value: validScores.filter((item) => item.score >= 70 && item.score < 80).length },
    { label: '80–89%', value: validScores.filter((item) => item.score >= 80 && item.score < 90).length },
    { label: '90–100%', value: validScores.filter((item) => item.score >= 90).length },
  ]

  return (
    <div>
      <section
        aria-label="Gradebook filters"
        className="mb-6 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035] sm:p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {writable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select label="Term" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {terms.length === 0 && <option value="">No terms defined</option>}
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select label="Assessment" value={assessment} onChange={(e) => setAssessment(e.target.value)}>
            {assessmentTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        {readOnly ? (
          <div className="mt-5 border-t border-ink/5 pt-4 dark:border-white/10">
            <div className="grid gap-3 sm:grid-cols-[minmax(12rem,0.7fr)_1fr] sm:items-end">
              <Select label="Report period" value={reportScope} onChange={(event) => setReportScope(event.target.value as ReportScope)}>
                <option value="term">Selected term · {terms.find((term) => term.id === termId)?.name ?? 'Choose a term'}</option>
                <option value="year">Full academic year</option>
              </Select>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => void handleExport('pdf')} loading={isExporting} disabled={!selectedClass || !termId || isExporting} icon={<Printer className="h-4 w-4" />}>
                  Save as PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleExport('xlsx')} loading={isExporting} disabled={!selectedClass || !termId || isExporting} icon={<DownloadSimple className="h-4 w-4" />}>
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleExport('csv')} loading={isExporting} disabled={!selectedClass || !termId || isExporting} icon={<DownloadSimple className="h-4 w-4" />}>
                  CSV
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end border-t border-ink/5 pt-4 dark:border-white/10">
            <Button onClick={handleSave} loading={isSaving} disabled={!canSave} icon={<Save className="h-4 w-4" />}>
              {isSaving ? 'Saving…' : 'Save Grades'}
            </Button>
          </div>
        )}
      </section>

      {!isLoading && !loadError && terms.length > 0 && students.length > 0 && (
        <AdminSectionInsights
          metrics={[
            { label: 'Average score', value: averageScore === null ? '—' : `${averageScore.toFixed(1)}%` },
            {
              label: 'Pass rate',
              value: validScores.length ? `${Math.round((passedScores / validScores.length) * 100)}%` : '—',
              progress: validScores.length ? (passedScores / validScores.length) * 100 : 0,
            },
            { label: 'Scores entered', value: validScores.length, detail: `of ${students.length} students` },
          ]}
          charts={[
            {
              kind: 'donut',
              title: 'Pass threshold · 50%',
              segments: [
                { label: 'At or above 50%', value: passedScores },
                { label: 'Below 50%', value: validScores.length - passedScores },
              ],
            },
          ]}
          insight={readOnly
            ? 'Distribution reflects the selected class, subject, term and assessment.'
            : 'Distribution reflects the selected class, subject, term and assessment; unsaved score edits are included.'}
        />
      )}

      {terms.length === 0 ? (
        <EmptyState
          title="No terms defined yet"
          description="Grades are recorded against a term. Ask your administrator to set up the academic year first."
        />
      ) : isLoading ? (
        <SkeletonRows />
      ) : students.length === 0 ? (
        <EmptyState title="No students in this class" description="Add students to this class to begin recording grades." />
      ) : (
        <div className="card divide-y divide-ink/5 dark:divide-white/5">
          <div className="flex items-center justify-between px-5 py-3.5 text-xs font-medium text-graphite">
            <span>Student</span>
            <span>Score / {MAX_SCORE}</span>
          </div>
          {students.map((s) => {
            const raw = scores[s.id] ?? ''
            const num = Number(raw)
            const grade = raw !== '' && !Number.isNaN(num) ? scoreToGrade(num) : null
            return (
              <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={s.name} color={s.avatarColor} size="sm" />
                  <p className="text-sm font-medium text-ink dark:text-white">{s.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  {grade && <span className={cn('w-8 text-right text-sm font-semibold', gradeTone(grade))}>{grade}</span>}
                  {readOnly ? (
                    <span className="w-20 rounded-lg border border-ink/10 px-3 py-2 text-center text-sm font-medium tabular-nums text-ink dark:border-white/10 dark:text-white">
                      {raw || '—'}
                    </span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={MAX_SCORE}
                      value={raw}
                      onChange={(e) => setScores((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="input w-20 text-center"
                      placeholder="—"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {printReport && (
        <article className="print-only print-document" aria-label="Class grade report">
          <header className="mb-6 border-b border-gray-300 pb-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-graphite">Nom Cloud · Academic report</p>
            <h1 className="mt-2 text-2xl font-bold text-ink">{printReport.title}</h1>
            <p className="mt-1 text-sm text-graphite">
              {printReport.className} · {printReport.academicYear} · {printReport.period}
            </p>
          </header>
          <table className="text-left text-sm">
            <thead>
              <tr>
                {['Student', 'Subject', 'Term', 'Assessment', 'Score'].map((heading) => (
                  <th key={heading} className="border-b border-gray-300 px-2 py-2 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printReport.records.map((record, index) => (
                <tr key={`${record.student}-${record.subject}-${record.term}-${record.assessment}-${index}`}>
                  {[record.student, record.subject, record.term, record.assessment, record.score].map((value, cellIndex) => (
                    <td key={cellIndex} className="border-b border-gray-200 px-2 py-2">{value}</td>
                  ))}
                </tr>
              ))}
              {printReport.records.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-6 text-center">No recorded scores for this period.</td></tr>
              )}
            </tbody>
          </table>
        </article>
      )}
    </div>
  )
}

function ClassPicker({
  classes,
  classId,
  onChange,
}: {
  classes: ClassSummary[]
  classId: string
  onChange: (id: string) => void
}) {
  return (
    <section
      aria-label="Gradebook filters"
      className="mb-6 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035] sm:p-5"
    >
      <div className="sm:max-w-xs">
        <Select label="Class" value={classId} onChange={(e) => onChange(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
    </section>
  )
}
