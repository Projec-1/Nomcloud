import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Warning as AlertTriangle, CheckCircle as CheckCircle2, Download, MinusCircle, Upload, XCircle } from '@phosphor-icons/react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import RequestProcessing from '@/components/ui/RequestProcessing'
import { InlineLoader } from '@/components/ui/Loader'
import { useAuth } from '@/context/AuthContext'
import { downloadResults, downloadTemplate, readSheet, toRecords, ImportFileError, type SheetMatrix } from '@/services/import/spreadsheet'
import { matchHeaders, unmappedRequired, unmappedRequiredMessage } from '@/services/import/headers'
import { runImport, summariseImport, type ImportProgress } from '@/services/import/run'
import type { ColumnMapping, ImportKind, ImportPlan, RowOutcome } from '@/services/import/types'
import { errorMessage } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Upload → Review → Import, for teachers, classes and students.
//
// ONE DIALOG, ONE LOOK. The chrome here — the numbered stepper, the dashed drop
// zone, the "N detected / X valid · Y errors" line, the searchable paginated
// preview and the RequestProcessing footer — is the design already used by the
// Students page. It is reused verbatim for all three imports so a school never
// meets two different-looking importers.
//
// THE ENGINE IS THE REAL ONE. Rows are validated against the live database and
// written through the same services the forms use, in batches, with per-row
// outcomes. Nothing is written until the preview is confirmed, and nothing is
// ever stored in the browser.
//
// THEIR FILE, NOT OURS. A school with 500 pupils already has a spreadsheet, so
// their headers are recognised from a list of real-world names and the import
// goes straight to the preview when everything needed was found. Only when a
// REQUIRED field cannot be recognised does a mapping step appear, asking the one
// question that cannot be answered for them: which of your columns is this?
// The step is also reachable from the preview, so an unrecognised column can be
// mapped even when nothing was actually blocking.
//
// The mapping step is built from the Select and Button already used everywhere
// else in the app. No new dialog, no new layout, no new styling.
//
// WHO MAY IMPORT. Offered to an owner, director or administrator. The database's
// own rule is unchanged and slightly wider (it also admits a principal), so a
// principal calling the API directly is still permitted, exactly as they are
// for every other write.
// ---------------------------------------------------------------------------

type Phase = 'upload' | 'reading' | 'mapping' | 'review' | 'importing' | 'done'

const IMPORTER_ROLES = ['owner', 'director', 'administrator']
const PAGE_SIZE = 25

export default function ImportDialog<T, Ctx>({
  kind,
  open,
  onClose,
  onImported,
}: {
  kind: ImportKind<T, Ctx>
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const { school, memberships } = useAuth()
  const schoolId = school?.id ?? null
  const mayImport = memberships.some((m) => IMPORTER_ROLES.includes(m.role))

  const [phase, setPhase] = useState<Phase>('upload')
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [plan, setPlan] = useState<ImportPlan<T> | null>(null)
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [resultsBusy, setResultsBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [sheet, setSheet] = useState<SheetMatrix | null>(null)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const contextRef = useRef<Ctx | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const taskIdRef = useRef(0)
  const readingRef = useRef(false)
  const importingRef = useRef(false)

  const reset = useCallback(() => {
    taskIdRef.current += 1
    readingRef.current = false
    importingRef.current = false
    setPhase('upload')
    setError(null)
    setBlocked(null)
    setPlan(null)
    setOutcomes(null)
    setProgress(null)
    setSearch('')
    setPage(1)
    setMapping({})
    setSheet(null)
    setUnmatched([])
    contextRef.current = null
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const getTemplate = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadTemplate({
        fileName: kind.fileName,
        sheetName: kind.title.replace('Import ', ''),
        columns: kind.columns,
        notes: kind.notes,
        maxRows: kind.maxRows,
      })
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Builds the plan from the grid already in memory and the mapping in force.
   *
   * Separate from reading the file so correcting the mapping costs nothing: the
   * administrator never has to choose the file again.
   */
  const buildPlan = useCallback(
    (source: SheetMatrix, columnMapping: ColumnMapping): boolean => {
      const context = contextRef.current
      if (!context) return false

      const missing = unmappedRequired(columnMapping, kind.columns)
      if (missing.length > 0) {
        setError(unmappedRequiredMessage(missing))
        return false
      }

      const { rows } = toRecords(source, kind.columns, columnMapping)
      if (rows.length === 0) {
        setError('Add a header row and at least one row of data.')
        return false
      }
      if (rows.length > kind.maxRows) {
        setError(`That file has ${rows.length} rows. The limit is ${kind.maxRows} per file — split it and import in parts.`)
        return false
      }

      setError(null)
      setPlan(kind.prepare(rows, context, columnMapping))
      setPage(1)
      setSearch('')
      return true
    },
    [kind],
  )

  const processFile = async (file: File | undefined) => {
    if (!file || !schoolId || readingRef.current || phase === 'importing') return
    readingRef.current = true
    const taskId = ++taskIdRef.current
    setPhase('reading')
    setError(null)
    setBlocked(null)
    try {
      const context = await kind.loadContext(schoolId)
      if (taskId !== taskIdRef.current) return
      contextRef.current = context

      const stop = kind.precheck(context)
      if (stop) {
        setBlocked(stop)
        setPhase('upload')
        return
      }

      const source = await readSheet(file)
      if (taskId !== taskIdRef.current) return
      setSheet(source)

      // Recognise their headers. Everything required found means no questions:
      // straight to the preview, which is the whole point.
      const match = matchHeaders(source.headers, kind.columns)
      setMapping(match.mapping)
      setUnmatched(match.unmatched)

      if (match.missingRequired.length > 0) {
        setError(unmappedRequiredMessage(unmappedRequired(match.mapping, kind.columns)))
        setPhase('mapping')
        return
      }
      setPhase(buildPlan(source, match.mapping) ? 'review' : 'mapping')
    } catch (err: unknown) {
      if (taskId !== taskIdRef.current) return
      setError(err instanceof ImportFileError ? err.message : `Could not read ${file.name}. ${errorMessage(err)}`)
      setPhase('upload')
    } finally {
      if (taskId === taskIdRef.current) readingRef.current = false
    }
  }

  const applyMapping = () => {
    if (!sheet) return
    if (buildPlan(sheet, mapping)) setPhase('review')
  }

  const startImport = async () => {
    if (importingRef.current || phase !== 'review' || !schoolId || !plan || !contextRef.current) return
    importingRef.current = true
    const taskId = ++taskIdRef.current
    setPhase('importing')
    setProgress({ done: 0, total: plan.counts.ready, current: null })
    try {
      const results = await runImport({ schoolId, kind, plan, context: contextRef.current, onProgress: setProgress })
      if (taskId !== taskIdRef.current) return
      setOutcomes(results)
      setPhase('done')
      onImported()
    } catch (err: unknown) {
      if (taskId !== taskIdRef.current) return
      setError(errorMessage(err))
      setPhase('review')
    } finally {
      if (taskId === taskIdRef.current) importingRef.current = false
    }
  }

  const handleDownloadResults = async () => {
    if (resultsBusy || !outcomes) return
    setResultsBusy(true)
    setError(null)
    try {
      await downloadResults(`${kind.fileName} - results`, outcomes)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setResultsBusy(false)
    }
  }

  // The preview table's columns come from the kind, so the same table serves
  // teachers, classes and students without three bespoke layouts.
  const previewRows = useMemo(() => {
    if (!plan) return []
    const query = search.trim().toLowerCase()
    if (!query) return plan.rows
    return plan.rows.filter((row) =>
      kind.columns.some((column) => (row.raw[column.key] ?? '').toLowerCase().includes(query))
      || row.problems.join(' ').toLowerCase().includes(query)
      || String(row.row).includes(query),
    )
  }, [plan, search, kind.columns])

  const pageCount = Math.max(1, Math.ceil(previewRows.length / PAGE_SIZE))
  const visibleRows = previewRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const summary = outcomes ? summariseImport(outcomes) : null
  const noun = kind.id === 'classes' ? 'classes' : kind.id

  if (!open) return null

  if (!mayImport) {
    return (
      <Modal open={open} onClose={onClose} title={kind.title}>
        <p className="text-sm text-graphite">
          Importing is available to the school&rsquo;s owner, director or administrator.
        </p>
      </Modal>
    )
  }

  const step = (label: string, active: boolean) => (
    <span className={active ? 'rounded-full bg-brand px-2 py-1 text-white' : ''}>{label}</span>
  )

  return (
    <Modal
      open={open}
      onClose={() => {
        if (phase === 'importing') return
        taskIdRef.current += 1
        readingRef.current = false
        onClose()
      }}
      title={`Bulk import ${noun}`}
      description="1 Upload → 2 Review → 3 Import. Everything is processed in your browser."
      size="xl"
      footer={
        phase === 'importing' && progress ? (
          <RequestProcessing
            compact
            title={`Importing ${noun}…`}
            description={`Writing row ${Math.min(progress.done + 1, progress.total)} of ${progress.total} to your school.`}
          />
        ) : phase === 'done' ? (
          <>
            <Button variant="outline" loading={resultsBusy} onClick={() => void handleDownloadResults()}>
              <Download className="h-4 w-4" /> Download results
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {phase === 'mapping' ? (
              <Button onClick={applyMapping}>Use these columns</Button>
            ) : (
              <Button disabled={!plan || plan.counts.ready === 0 || phase !== 'review'} onClick={() => void startImport()}>
                Import {plan?.counts.ready ?? 0} valid {noun}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-graphite">
          {step('1 Upload', true)}
          <span>→</span>
          {step('2 Review', phase === 'mapping' || phase === 'review' || phase === 'importing' || phase === 'done')}
          <span>→</span>
          {step('3 Import', phase === 'done')}
        </div>

        {phase !== 'done' && phase !== 'mapping' && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              disabled={phase === 'reading' || phase === 'importing'}
              onChange={(e) => void processFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={phase === 'reading' || phase === 'importing'}
              aria-busy={phase === 'reading' || undefined}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (phase === 'reading' || phase === 'importing') return
                const file = event.dataTransfer.files[0]
                if (file) void processFile(file)
              }}
              className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/10 px-6 py-10 text-center hover:border-accent disabled:cursor-wait disabled:opacity-70 dark:border-white/10"
            >
              {phase === 'reading' ? (
                <InlineLoader label={`Reading and checking ${noun}`} state="working" />
              ) : (
                <>
                  <Upload className="h-7 w-7 text-accent" />
                  <span className="mt-3 text-sm font-semibold text-ink dark:text-white">Upload {noun} file</span>
                </>
              )}
              <span className="mt-1 text-xs text-graphite">Drop a file here or choose Excel File</span>
              <span className="mt-2 text-[11px] text-graphite">Supported formats: XLSX, CSV · up to {kind.maxRows} rows</span>
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => void getTemplate()} loading={busy}>
                <Download className="h-4 w-4" /> Download example file
              </Button>
              <p className="text-xs text-graphite">
                Upload your own spreadsheet — common column names are recognised, and you will be asked only about a
                column Nom Cloud cannot place. The example file is optional, and shows the columns that can be used. No
                invitation email is sent by importing.
              </p>
            </div>
          </>
        )}

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs text-red-500">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </p>
        )}

        {blocked && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-ink dark:text-white">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
            {blocked}
          </p>
        )}

        {/* ---------------- column mapping ---------------- */}
        {phase === 'mapping' && sheet && (
          <div>
            <p className="text-sm font-semibold text-ink dark:text-white">Which of your columns is which?</p>
            <p className="mt-1 text-xs text-graphite">
              Nom Cloud read {sheet.headers.length} columns from your file and placed the ones it recognised. Point the
              rest at the right column, or leave them as not in your file. A field marked with{' '}
              <span className="text-brand">*</span> is needed before the import can run.
            </p>

            <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {kind.columns.map((column) => (
                <Select
                  key={column.key}
                  label={column.header}
                  required={column.required}
                  value={mapping[column.key] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [column.key]: event.target.value || null }))
                  }
                  error={column.required && !mapping[column.key] ? 'Choose the column that holds it' : undefined}
                >
                  <option value="">— not in my file —</option>
                  {sheet.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              ))}
            </div>

            {unmatched.length > 0 && (
              <p className="mt-3 text-xs text-graphite">
                Not used yet: {unmatched.join(', ')}. Columns Nom Cloud has no place for are ignored, and nothing in your
                file is changed.
              </p>
            )}
          </div>
        )}

        {/* ---------------- review ---------------- */}
        {(phase === 'review' || phase === 'importing') && plan && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink dark:text-white">{plan.counts.total} {noun} detected</p>
                <p className="text-xs text-graphite">
                  {plan.counts.ready} valid · {plan.counts.error} errors
                  {plan.counts.exists > 0 && ` · ${plan.counts.exists} already in Nom Cloud`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {phase === 'review' && (
                  <Button variant="outline" size="sm" onClick={() => setPhase('mapping')}>
                    Change columns
                  </Button>
                )}
                <input
                  className="input h-9 w-40 text-xs"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Search preview"
                />
              </div>
            </div>

            {plan.notices.length > 0 && (
              <ul className="mb-3 space-y-1 rounded-xl bg-brand/5 px-3 py-2.5 text-xs text-graphite">
                {plan.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            )}

            <div className="max-h-64 overflow-y-auto rounded-xl border border-ink/5 dark:border-white/10">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="sticky top-0 bg-mist/95 text-graphite">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    {kind.columns.map((column) => (
                      <th key={column.key} className="px-3 py-2 font-semibold">
                        {column.header}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-semibold">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    // The raw cells, so a rejected row still shows the pupil's
                    // name rather than a line of dashes.
                    const values = row.raw
                    return (
                      <tr key={row.row} className="border-t border-ink/5 align-top">
                        <td className="px-3 py-2 text-graphite">{row.row}</td>
                        {kind.columns.map((column) => (
                          <td key={column.key} className="px-3 py-2">
                            {values[column.key]?.trim() || '—'}
                          </td>
                        ))}
                        <td
                          className={`px-3 py-2 font-semibold ${
                            row.status === 'ready'
                              ? 'text-emerald-600'
                              : row.status === 'exists'
                                ? 'text-amber-600'
                                : 'text-red-500'
                          }`}
                        >
                          {row.status === 'ready' ? 'Valid' : row.status === 'exists' ? (row.note ?? 'Already exists') : row.problems.join('; ')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-graphite">
              <span>
                {previewRows.length
                  ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, previewRows.length)} of ${previewRows.length}`
                  : `0 ${noun}`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>

            <p className="mt-3 text-xs text-graphite">
              Nothing has been written yet. Importing will create <strong>{plan.counts.ready}</strong> and leave the other{' '}
              {plan.counts.total - plan.counts.ready} alone.
            </p>
          </div>
        )}

        {/* ---------------- done ---------------- */}
        {phase === 'done' && summary && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-ink dark:text-white">
              {summary.created.length} created · {summary.skipped.length} skipped · {summary.failed.length} failed
            </p>
            <OutcomeList icon={CheckCircle2} tone="text-emerald-600" title="Created" rows={summary.created} />
            <OutcomeList icon={MinusCircle} tone="text-amber-600" title="Skipped" rows={summary.skipped} />
            <OutcomeList icon={XCircle} tone="text-red-500" title="Failed" rows={summary.failed} />
            <p className="text-xs text-graphite">
              Download the results to see every row&rsquo;s outcome, fix the failures and re-upload just those. Nobody has
              been emailed — invite them from the Teachers or Guardians page when the data looks right.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function OutcomeList({
  icon: Icon,
  tone,
  title,
  rows,
}: {
  icon: typeof CheckCircle2
  tone: string
  title: string
  rows: RowOutcome[]
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className={`mb-1.5 flex items-center gap-1.5 text-sm font-medium ${tone}`}>
        <Icon className="h-4 w-4" /> {title} ({rows.length})
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-graphite">
        {rows.slice(0, 60).map((row) => (
          <li key={row.row}>
            <span className="text-ink dark:text-white">Row {row.row}</span> — {row.label}: {row.detail}
          </li>
        ))}
        {rows.length > 60 && <li className="italic">…and {rows.length - 60} more, in the results file.</li>}
      </ul>
    </div>
  )
}
