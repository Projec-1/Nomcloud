import { useEffect, useMemo, useState } from 'react'
import { CreditCard, FileText, Receipt } from '@phosphor-icons/react'
import type { School } from '@/pages/platform/types'
import Button from '@/components/ui/Button'
import {
  fetchPlatformFeatureFlags,
  fetchPlatformBillingLedger,
  type PlatformBillingLedger,
} from '@/services/platformControlsService'
import { errorMessage } from '@/utils/errorMessage'
import { KpiTile, Panel, SectionHeader } from './PrototypeKit'

function formatAmount(amountMinor: number, currency: string): string {
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency })
    const divisor = 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2)
    return formatter.format(amountMinor / divisor)
  } catch {
    return `${currency} ${amountMinor.toLocaleString()} minor units`
  }
}

export default function BillingSection({ schools, loading }: { schools: School[]; loading: boolean }) {
  const [ledger, setLedger] = useState<PlatformBillingLedger>({ invoices: [], payments: [], events: [] })
  const [ledgerLoading, setLedgerLoading] = useState(true)
  const [ledgerEnabled, setLedgerEnabled] = useState<boolean | null>(null)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const schoolNames = useMemo(() => new Map(schools.map((school) => [school.id, school.name])), [schools])

  const plans = schools.reduce<Record<string, number>>((counts, school) => {
    const plan = school.plan.trim() || 'Plan unavailable'
    counts[plan] = (counts[plan] ?? 0) + 1
    return counts
  }, {})
  const assignedPlanCount = schools.filter((school) => school.plan !== 'No subscription' && school.plan !== 'Plan unavailable').length

  useEffect(() => {
    let cancelled = false
    setLedgerLoading(true)
    setLedgerError(null)
    Promise.all([fetchPlatformBillingLedger(), fetchPlatformFeatureFlags()])
      .then(([records, flags]) => {
        if (cancelled) return
        setLedger(records)
        setLedgerEnabled(flags.find((flag) => flag.flag_key === 'billing_ledger')?.enabled ?? false)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLedgerError(errorMessage(cause, 'Billing ledger records could not be loaded.'))
      })
      .finally(() => { if (!cancelled) setLedgerLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  const invoiceById = useMemo(() => new Map(ledger.invoices.map((invoice) => [invoice.id, invoice])), [ledger.invoices])

  return <>
    <SectionHeader eyebrow="Commercial operations" title="Billing" description="Actual school subscription labels and the auditable invoice/payment ledger. No payment gateway is connected." />
    <div className="grid gap-4 md:grid-cols-3">
      <KpiTile label="Schools with a plan label" value={loading ? '…' : assignedPlanCount.toLocaleString()} detail="From joined school subscription records" icon={CreditCard} />
      <KpiTile label="Invoices in ledger" value={ledgerLoading ? '…' : ledgerEnabled === false ? 'Disabled' : ledger.invoices.length.toLocaleString()} detail="Latest 100 rows visible to this operator" icon={FileText} />
      <KpiTile label="Payments in ledger" value={ledgerLoading ? '…' : ledgerEnabled === false ? 'Disabled' : ledger.payments.length.toLocaleString()} detail="Only provider-backed server records" icon={Receipt} />
    </div>

    {ledgerError && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-300">
      <span>{ledgerError}</span><Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>Retry ledger</Button>
    </div>}

    <Panel title="Plan labels on loaded schools" description={`${loading ? 'Loading' : schools.length.toLocaleString()} school records; counts describe those rows only.`} className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading subscription records…</p>
        : schools.length ? <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {Object.entries(plans).sort(([left], [right]) => left.localeCompare(right)).map(([plan, count]) => <li key={plan} className="flex items-center justify-between gap-4 py-3 text-sm">
            <span>{plan}</span><span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
          </li>)}
        </ul> : <p className="text-sm text-graphite">No school subscription records are available.</p>}
    </Panel>

    <Panel title="Invoices" description="Statuses and history come from the durable billing ledger; no historical records are synthesized." className="mt-6">
      {ledgerLoading ? <p role="status" className="text-sm text-graphite">Loading invoice records…</p>
        : ledgerEnabled === false ? <p className="text-sm text-graphite">Billing Ledger is disabled by its platform feature flag. No ledger records are exposed.</p>
          : ledger.invoices.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b border-ink/[0.08] text-xs uppercase tracking-wide text-graphite"><th className="py-3 pr-4">Invoice</th><th className="py-3 pr-4">School</th><th className="py-3 pr-4">Amount</th><th className="py-3 pr-4">Status</th><th className="py-3">Due</th></tr></thead>
          <tbody>{ledger.invoices.map((invoice) => <tr key={invoice.id} className="border-b border-ink/[0.05] dark:border-white/[0.06]">
            <td className="py-3 pr-4 font-medium">{invoice.invoice_number}</td>
            <td className="py-3 pr-4">{schoolNames.get(invoice.school_id) ?? 'School record unavailable'}</td>
            <td className="py-3 pr-4 tabular-nums">{formatAmount(invoice.amount_minor, invoice.currency)}</td>
            <td className="py-3 pr-4 capitalize">{invoice.status.replace('_', ' ')}</td>
            <td className="py-3">{invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : 'Not set'}</td>
          </tr>)}</tbody>
        </table></div> : <p className="text-sm text-graphite">No invoice records are present. Plan labels do not create invoices or imply an amount due.</p>}
    </Panel>

    <Panel title="Payments and audit history" description="A payment is recorded only by a trusted server integration; this screen cannot mark a payment complete." className="mt-6">
      {ledgerLoading ? <p role="status" className="text-sm text-graphite">Loading payment history…</p>
        : ledgerEnabled === false ? <p className="text-sm text-graphite">Billing Ledger is disabled by its platform feature flag.</p>
          : ledger.payments.length ? <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {ledger.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span>{invoiceById.get(payment.invoice_id)?.invoice_number ?? 'Invoice reference unavailable'} · {payment.provider}</span>
            <span className="font-medium">{formatAmount(payment.amount_minor, payment.currency)} · {payment.status}</span>
          </li>)}
        </ul> : <p className="text-sm text-graphite">No payment records are present. No gateway is connected, and no payment is being claimed as completed.</p>}
      {!!ledger.events.length && <div className="mt-5 border-t border-ink/[0.08] pt-4">
        <h3 className="text-sm font-semibold">Recent ledger events</h3>
        <ul className="mt-2 divide-y divide-ink/[0.05] dark:divide-white/[0.06]">
          {ledger.events.slice(0, 10).map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs text-graphite">
            <span>{event.event_type.replace(/_/g, ' ')}{event.to_status ? ` · ${event.from_status ? `${event.from_status} → ` : ''}${event.to_status}` : ''}</span>
            <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
          </li>)}
        </ul>
      </div>}
    </Panel>
  </>
}
