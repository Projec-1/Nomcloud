import { useState } from 'react'
import { CalendarBlank as CalendarRange, Info, Plus, CheckCircle as CheckCircle2 } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ResourceGate from '@/components/ui/ResourceGate'
import { useAcademicStructure, type AcademicStructure } from '@/hooks/useAcademicStructure'
import {
  activateAcademicYear,
  createAcademicYear,
  createTerm,
  type AcademicYearRow,
} from '@/services/academicService'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import { todayInTimeZone, DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { errorMessage } from '@/utils/errorMessage'
import type { FieldErrors } from '@/utils/validators'

// ---------------------------------------------------------------------------
// Academic years and terms. SYSTEM_ISSUES_LIST K1 and K2.
//
// Phase 8 batch 2 made this page read-only, and said why: switching the active
// year was two statements a browser cannot make atomic, so a failure between
// them could leave a school with no current year. Migration 20260916000003
// supplies the missing piece, and this page now uses it:
//
//   ADD A YEAR        a school's FIRST year is created active, since there is
//                     nothing to close and no class can exist without one.
//                     Every later year is created 'upcoming'.
//   SET AS CURRENT    one call to activate_academic_year, which closes the
//                     current year, ends its open enrolments and activates the
//                     chosen year in a single transaction.
//   ADD A TERM        with dates checked by the database against the year and
//                     against the year's other terms.
//
// NOTHING HERE HIDES HISTORY. A closed year keeps its card, its terms and every
// record filed under it; "closed" only stops new classes and enrolments being
// written into it. The "Add academic year" button sits in the page header, not
// inside the year list, so a school with no years at all still has a way in.
// ---------------------------------------------------------------------------

const statusTone = { active: 'success', upcoming: 'info', closed: 'neutral' } as const

/** YYYY-MM-DD arithmetic in UTC, so a date never shifts with the browser's timezone. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

function labelFor(startDate: string, endDate: string): string {
  const a = startDate.slice(0, 4)
  const b = endDate.slice(0, 4)
  return a === b ? a : `${a} / ${b}`
}

/**
 * Sensible defaults for a new year. The first year covers the school year we are
 * in now (September to June); a later year starts on the first September after
 * the latest year ends, so the suggestion never overlaps an existing year.
 */
function suggestYear(years: AcademicYearRow[], today: string) {
  let startYear: number
  if (years.length === 0) {
    const y = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))
    startYear = month >= 8 ? y : y - 1
  } else {
    const latestEnd = years.map((y) => y.end_date).sort().at(-1) as string
    const endYear = Number(latestEnd.slice(0, 4))
    const endMonth = Number(latestEnd.slice(5, 7))
    startYear = endMonth < 9 ? endYear : endYear + 1
  }
  const startDate = `${startYear}-09-01`
  const endDate = `${startYear + 1}-06-30`
  return { label: labelFor(startDate, endDate), startDate, endDate }
}

export default function AdminAcademicYears() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const { state, reload } = useAcademicStructure()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const structure = state.status === 'ready' ? state.data : null
  const years = structure?.years ?? []
  const activeYear = structure?.activeYear ?? null
  const isFirstYear = years.length === 0

  // ---- add a year
  const [yearOpen, setYearOpen] = useState(false)
  const [yearForm, setYearForm] = useState({ label: '', startDate: '', endDate: '' })
  const [labelTouched, setLabelTouched] = useState(false)
  const [yearErrors, setYearErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  const openAddYear = () => {
    setYearForm(suggestYear(years, todayInTimeZone(timeZone)))
    setLabelTouched(false)
    setYearErrors({})
    setYearOpen(true)
  }

  const setYearDates = (next: { startDate?: string; endDate?: string }) => {
    setYearForm((f) => {
      const merged = { ...f, ...next }
      return labelTouched || !merged.startDate || !merged.endDate
        ? merged
        : { ...merged, label: labelFor(merged.startDate, merged.endDate) }
    })
  }

  const submitYear = async () => {
    const next: FieldErrors = {}
    if (yearForm.label.trim().length < 2) next.label = 'Give the year a name, for example 2026 / 2027.'
    if (!yearForm.startDate) next.startDate = 'Choose a start date.'
    if (!yearForm.endDate) next.endDate = 'Choose an end date.'
    if (yearForm.startDate && yearForm.endDate && yearForm.endDate <= yearForm.startDate) {
      next.endDate = 'The year must end after it starts.'
    }
    setYearErrors(next)
    if (Object.keys(next).length > 0 || !schoolId) return

    setSaving(true)
    try {
      await createAcademicYear(schoolId, yearForm, isFirstYear)
      showToast({
        type: 'success',
        title: isFirstYear ? 'Your first academic year is set' : 'Academic year added',
        description: isFirstYear
          ? `${yearForm.label} is now the current year. Add its terms, then create your classes.`
          : `${yearForm.label} is upcoming. Set it as the current year when it begins.`,
      })
      setYearOpen(false)
      reload()
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Academic year not added', description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  // ---- add a term
  const [termYear, setTermYear] = useState<AcademicYearRow | null>(null)
  const [termForm, setTermForm] = useState({ name: '', startDate: '', endDate: '', sortOrder: 1 })
  const [termErrors, setTermErrors] = useState<FieldErrors>({})

  const openAddTerm = (year: AcademicYearRow) => {
    const yearTerms = (structure?.terms ?? [])
      .filter((t) => t.academic_year_id === year.id)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
    const last = yearTerms.at(-1)
    const startDate = last ? addDays(last.end_date, 1) : year.start_date
    const suggestedEnd = addDays(addMonths(startDate, 3), -1)
    setTermForm({
      name: `Term ${yearTerms.length + 1}`,
      startDate,
      endDate: suggestedEnd > year.end_date ? year.end_date : suggestedEnd,
      sortOrder: yearTerms.length + 1,
    })
    setTermErrors({})
    setTermYear(year)
  }

  const submitTerm = async () => {
    if (!termYear || !schoolId) return
    const next: FieldErrors = {}
    if (termForm.name.trim().length < 1) next.name = 'Give the term a name.'
    if (!termForm.startDate) next.startDate = 'Choose a start date.'
    if (!termForm.endDate) next.endDate = 'Choose an end date.'
    if (termForm.startDate && termForm.endDate && termForm.endDate <= termForm.startDate) {
      next.endDate = 'The term must end after it starts.'
    }
    setTermErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      await createTerm(schoolId, { academicYearId: termYear.id, ...termForm })
      showToast({ type: 'success', title: 'Term added', description: `${termForm.name} added to ${termYear.label}.` })
      setTermYear(null)
      reload()
    } catch (err: unknown) {
      // The database checks the dates against the year and its other terms and
      // explains which rule failed.
      showToast({ type: 'error', title: 'Term not added', description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  // ---- switch the current year
  const [switchTarget, setSwitchTarget] = useState<AcademicYearRow | null>(null)

  const confirmSwitch = async () => {
    if (!switchTarget || !schoolId) return
    try {
      const result = await activateAcademicYear(schoolId, switchTarget.id)
      showToast({
        type: 'success',
        title: `${result.activatedYearLabel} is now the current year`,
        description: result.previousYearLabel
          ? `${result.previousYearLabel} was closed${
              result.enrolmentsClosed > 0
                ? ` and ${result.enrolmentsClosed} ${result.enrolmentsClosed === 1 ? 'enrolment was' : 'enrolments were'} ended`
                : ''
            }. Its records stay available to view.`
          : undefined,
      })
      reload()
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Current year not changed', description: errorMessage(err) })
    } finally {
      setSwitchTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Academic Years"
        description="Plan terms ahead of time and switch the active year without losing history."
        actions={
          state.status === 'ready' || state.status === 'empty' ? (
            <Button onClick={openAddYear} icon={<Plus className="h-4 w-4" />}>
              Add academic year
            </Button>
          ) : undefined
        }
      />

      <ResourceGate
        state={state}
        empty={{
          icon: CalendarRange,
          title: 'Set up your first academic year',
          description:
            'Classes, enrolments, attendance and grades all belong to an academic year, so your school needs one before anything else. Most schools use September to June; you can adjust the dates.',
          action: (
            <Button onClick={openAddYear} icon={<Plus className="h-4 w-4" />}>
              Create your first academic year
            </Button>
          ),
        }}
        deniedHint="Academic years are managed by your school's administrator."
      >
        {(loaded) => (
          <>
            <YearGrid structure={loaded} onAddTerm={openAddTerm} onSetCurrent={setSwitchTarget} />
          </>
        )}
      </ResourceGate>

      <Modal
        open={yearOpen}
        onClose={() => setYearOpen(false)}
        title={isFirstYear ? 'Your first academic year' : 'Add academic year'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setYearOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitYear} loading={saving}>
              {saving ? 'Saving…' : isFirstYear ? 'Create and set as current' : 'Add year'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Starts"
              type="date"
              required
              value={yearForm.startDate}
              onChange={(e) => setYearDates({ startDate: e.target.value })}
              error={yearErrors.startDate}
            />
            <Input
              label="Ends"
              type="date"
              required
              value={yearForm.endDate}
              onChange={(e) => setYearDates({ endDate: e.target.value })}
              error={yearErrors.endDate}
            />
          </div>
          <Input
            label="Name"
            required
            value={yearForm.label}
            onChange={(e) => {
              setLabelTouched(true)
              setYearForm({ ...yearForm, label: e.target.value })
            }}
            error={yearErrors.label}
          />
          <p className="text-xs text-graphite">
            {isFirstYear
              ? 'This becomes your current year straight away, so you can add terms and create classes next.'
              : activeYear
                ? `This is added as upcoming. ${activeYear.label} stays current until you set this one as current.`
                : 'This is added as upcoming. Set it as current when it begins.'}{' '}
            Years at one school cannot overlap.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!termYear}
        onClose={() => setTermYear(null)}
        title={termYear ? `Add a term to ${termYear.label}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTermYear(null)}>
              Cancel
            </Button>
            <Button onClick={submitTerm} loading={saving}>
              {saving ? 'Saving…' : 'Add term'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            required
            value={termForm.name}
            onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
            error={termErrors.name}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Starts"
              type="date"
              required
              min={termYear?.start_date}
              max={termYear?.end_date}
              value={termForm.startDate}
              onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })}
              error={termErrors.startDate}
            />
            <Input
              label="Ends"
              type="date"
              required
              min={termYear?.start_date}
              max={termYear?.end_date}
              value={termForm.endDate}
              onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })}
              error={termErrors.endDate}
            />
          </div>
          {termYear && (
            <p className="text-xs text-graphite">
              A term must fall inside {termYear.label} ({formatDate(termYear.start_date)} –{' '}
              {formatDate(termYear.end_date)}) and must not overlap its other terms.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!switchTarget}
        title={switchTarget ? `Make ${switchTarget.label} the current year?` : ''}
        description={
          switchTarget
            ? activeYear
              ? `${activeYear.label} will be closed. Pupils still enrolled in its classes will have those enrolments ended, and no new classes or enrolments can be added to it. Everything recorded in ${activeYear.label} stays available to view. This happens in one step.`
              : `${switchTarget.label} becomes the current year.`
            : ''
        }
        confirmLabel="Set as current year"
        onConfirm={confirmSwitch}
        onCancel={() => setSwitchTarget(null)}
      />
    </div>
  )
}

function YearGrid({
  structure,
  onAddTerm,
  onSetCurrent,
}: {
  structure: AcademicStructure
  onAddTerm: (year: AcademicYearRow) => void
  onSetCurrent: (year: AcademicYearRow) => void
}) {
  const { years, terms, activeYear, term } = structure

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-ink/5 bg-white/60 px-4 py-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
        <Info className="h-3.5 w-3.5 shrink-0 text-graphite" />
        <span className="text-graphite">
          Active year:{' '}
          <span className="font-semibold text-ink dark:text-white">{activeYear ? activeYear.label : 'none set'}</span>
        </span>
        <span className="text-graphite">·</span>
        <span className="text-graphite">
          Current term:{' '}
          <span className="font-semibold text-ink dark:text-white">{term ? term.name : 'between terms'}</span>
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {years.map((year) => {
          const yearTerms = terms
            .filter((t) => t.academic_year_id === year.id)
            .sort((a, b) => a.start_date.localeCompare(b.start_date))
          return (
            <div
              key={year.id}
              className={cn('card flex flex-col p-6', year.status === 'active' && 'border-brand/30 ring-1 ring-brand/20')}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="rounded-xl bg-ink/5 p-2.5 text-ink dark:bg-white/10 dark:text-white">
                  <CalendarRange className="h-4 w-4" />
                </div>
                <Badge tone={statusTone[year.status]}>{year.status === 'active' ? 'current' : year.status}</Badge>
              </div>
              <p className="text-lg font-semibold text-ink dark:text-white">{year.label}</p>
              <p className="text-xs text-graphite">
                {formatDate(year.start_date)} — {formatDate(year.end_date)}
              </p>
              <div className="mt-4 space-y-2 border-t border-ink/5 pt-4 dark:border-white/10">
                {yearTerms.length === 0 ? (
                  <p className="text-xs text-graphite">No terms defined for this year yet.</p>
                ) : (
                  yearTerms.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className={cn('text-ink dark:text-white', term?.id === t.id && 'font-semibold text-brand')}>
                        {t.name}
                      </span>
                      <span className="text-graphite">
                        {formatDate(t.start_date)} – {formatDate(t.end_date)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Button variant="outline" size="sm" onClick={() => onAddTerm(year)} icon={<Plus className="h-4 w-4" />}>
                  Add term
                </Button>
                {year.status !== 'active' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetCurrent(year)}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Set as current
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
