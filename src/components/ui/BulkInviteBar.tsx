import { CheckCircle as CheckCircle2, Envelope as Mail, MinusCircle, XCircle } from '@phosphor-icons/react'
import { InlineLoader } from '@/components/ui/Loader'
import Button from '@/components/ui/Button'
import {
  gmailBudgetNote,
  reasonText,
  summariseBulkInvite,
  type BulkInviteProgress,
  type BulkInviteResult,
} from '@/services/bulkInvite'

// ---------------------------------------------------------------------------
// The bar above a people table while rows are selected, and the summary after.
//
// WHY THE SUMMARY LISTS NAMES. "3 sent, 2 skipped" tells an administrator
// nothing they can act on. Every row that did not get an invitation is named
// with its own reason, because each reason has a different remedy: add an
// address, restore access, revoke the live invitation first, or simply wait.
// ---------------------------------------------------------------------------

export default function BulkInviteBar({
  selectedCount,
  running,
  progress,
  results,
  onInvite,
  onClear,
  onDismissResults,
}: {
  selectedCount: number
  running: boolean
  progress: BulkInviteProgress | null
  results: BulkInviteResult[] | null
  onInvite: () => void
  onClear: () => void
  onDismissResults: () => void
}) {
  if (results) {
    const { sent, skipped, failed } = summariseBulkInvite(results)
    const attempted = sent.length + failed.length
    return (
      <div className="mb-5 rounded-2xl border border-ink/10 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-ink dark:text-white">
            {sent.length} sent · {skipped.length} skipped · {failed.length} failed
          </h3>
          <Button variant="outline" size="sm" onClick={onDismissResults}>
            Done
          </Button>
        </div>

        {sent.length > 0 && (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Invitation sent
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-graphite">
              {sent.map((r) => (
                <li key={r.id}>
                  {r.name} — {r.outcome.email ?? r.email}
                </li>
              ))}
            </ul>
          </div>
        )}

        {skipped.length > 0 && (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
              <MinusCircle className="h-4 w-4" /> Not invited
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-graphite">
              {skipped.map((r) => (
                <li key={r.id}>
                  <span className="text-ink dark:text-white">{r.name}</span> — {reasonText(r.outcome)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {failed.length > 0 && (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" /> Failed
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-graphite">
              {failed.map((r) => (
                <li key={r.id}>
                  <span className="text-ink dark:text-white">{r.name}</span> — {reasonText(r.outcome)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-xs text-graphite">{gmailBudgetNote(attempted)}</p>
      </div>
    )
  }

  if (running && progress) {
    const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
    return (
      <div className="mb-5 rounded-2xl border border-brand/30 bg-brand/5 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-white">
          <InlineLoader
            label={progress.pausing
              ? 'Pausing between batches, to stay inside the email rate limit…'
              : `Inviting ${Math.min(progress.done + 1, progress.total)} of ${progress.total}${progress.current ? ` — ${progress.current}` : ''}…`}
            state="working"
          />
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-graphite">
          {progress.done} of {progress.total} done. Sending is paced deliberately; leave this page open.
        </p>
      </div>
    )
  }

  if (selectedCount === 0) return null

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm font-medium text-ink dark:text-white">{selectedCount} selected</p>
      <Button size="sm" onClick={onInvite}>
        <Mail className="h-4 w-4" /> Invite selected
      </Button>
      <button type="button" onClick={onClear} className="text-sm text-graphite underline-offset-2 hover:underline">
        Clear selection
      </button>
    </div>
  )
}
