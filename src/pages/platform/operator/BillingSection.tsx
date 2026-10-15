import { useMemo, useState } from 'react'
import { ArrowsDownUp, Check, CreditCard, CurrencyDollar, Receipt, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { cn } from '@/utils/cn'
import { formatCurrency, timeAgo } from '@/utils/format'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  ExportButton,
  FilterChips,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SampleTag,
  SectionHeader,
  VerificationPanel,
  downloadCsv,
  relativeDays,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import {
  billingAdjustments,
  billingInvoices,
  billingPayments,
  billingPlans,
  schoolSubscriptions,
  type BillingInvoice,
  type BillingPayment,
  type SchoolSubscription,
} from './prototypeData'

const subscriptionStatuses = ['All', 'Active', 'Trialing', 'Past due', 'Cancelled'] as const
const invoiceStatuses = ['All', 'Paid', 'Open', 'Overdue', 'Void'] as const

const planPrices: Record<string, number> = Object.fromEntries(billingPlans.map((plan) => [plan.name, plan.monthly]))

export default function BillingSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [plans, setPlans] = useState(billingPlans)
  const [subscriptions, setSubscriptions] = useState(schoolSubscriptions)
  const [invoices, setInvoices] = useState(billingInvoices)
  const [payments, setPayments] = useState(billingPayments)
  const [adjustments, setAdjustments] = useState(billingAdjustments)
  const [subStatus, setSubStatus] = useState<(typeof subscriptionStatuses)[number]>('All')
  const [invoiceStatus, setInvoiceStatus] = useState<(typeof invoiceStatuses)[number]>('All')
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [creditOpen, setCreditOpen] = useState(false)
  const [planEdit, setPlanEdit] = useState<typeof billingPlans[number] | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const visibleSubscriptions = useMemo(() => subscriptions.filter((item) => subStatus === 'All' || item.status === subStatus), [subscriptions, subStatus])
  const visibleInvoices = useMemo(() => invoices.filter((item) => invoiceStatus === 'All' || item.status === invoiceStatus), [invoices, invoiceStatus])

  const selectedSubscription = useMemo(() => subscriptions.find((item) => item.id === subscriptionId) ?? null, [subscriptions, subscriptionId])
  const selectedInvoice = useMemo(() => invoices.find((item) => item.id === invoiceId) ?? null, [invoices, invoiceId])

  const mrr = subscriptions.reduce((sum, item) => sum + (item.status === 'Cancelled' ? 0 : item.mrr), 0)
  const outstanding = invoices.filter((invoice) => invoice.status === 'Overdue' || invoice.status === 'Open').reduce((sum, invoice) => sum + invoice.amount, 0)
  const failedPayments = payments.filter((payment) => payment.status === 'Failed')
  const collected = payments.filter((payment) => payment.status === 'Succeeded' && new Date(payment.at).getMonth() === new Date().getMonth()).reduce((sum, payment) => sum + payment.amount, 0)

  const changePlan = (subscription: SchoolSubscription, nextPlan: string, reason: string, approver: string, options: Record<string, boolean>) => {
    const nextPrice = planPrices[nextPlan] ?? 0
    setSubscriptions((current) => current.map((item) => item.id === subscription.id
      ? { ...item, plan: nextPlan, mrr: nextPrice, status: 'Active' }
      : item))
    record({
      action: 'Changed a school subscription',
      target: `${subscription.school} · ${subscription.id}`,
      reason,
      approver: approver || undefined,
      before: `${subscription.plan} · ${formatCurrency(subscription.mrr)}/month`,
      after: `${nextPlan} · ${formatCurrency(nextPrice)}/month`,
      result: 'Applied',
      options: options.notify ? ['School administrator notified'] : [],
    })
    setVerified([
      { label: 'School', value: subscription.school },
      { label: 'Plan', value: `${subscription.plan} → ${nextPlan}` },
      { label: 'Monthly amount', value: `${formatCurrency(subscription.mrr)} → ${formatCurrency(nextPrice)}` },
      { label: 'Proration', value: options.prorate ? 'Difference charged on the next invoice' : 'Starts on the next cycle', ok: options.prorate },
    ])
    setSubscriptionId(null)
    onNotify(`${subscription.school} moved to ${nextPlan}.`)
  }

  const cancelSubscription = (subscription: SchoolSubscription) => {
    setRequest({
      title: 'Cancel this subscription',
      target: `${subscription.school} · ${subscription.plan}`,
      description: 'The school keeps access until the end of the paid period, then loses it. Cancelling is recorded with a reason and needs a second operator.',
      confirmLabel: 'Cancel subscription',
      danger: true,
      requiresReason: true,
      requiresApproval: true,
      options: [
        { key: 'immediate', label: 'End access immediately instead of at the end of the paid period' },
        { key: 'notify', label: 'Tell the school administrator what happens next', defaultChecked: true },
      ],
      onConfirm: ({ reason, approver, options }) => {
        setSubscriptions((current) => current.map((item) => item.id === subscription.id ? { ...item, status: 'Cancelled', mrr: 0 } : item))
        record({
          action: 'Cancelled a school subscription',
          target: `${subscription.school} · ${subscription.id}`,
          reason,
          approver: approver || undefined,
          before: `${subscription.plan} · ${formatCurrency(subscription.mrr)}/month`,
          after: 'Cancelled',
          result: 'Applied',
          options: [options.immediate ? 'Access ended immediately' : 'Access ends at period end', ...(options.notify ? ['School notified'] : [])],
        })
        setVerified([
          { label: 'School', value: subscription.school },
          { label: 'Status', value: 'Active → Cancelled' },
          { label: 'Access ends', value: options.immediate ? 'Immediately' : `At the end of the paid period (${relativeDays(subscription.renewsAt)})` },
          { label: 'Monthly revenue removed', value: formatCurrency(subscription.mrr) },
        ])
        setSubscriptionId(null)
        onNotify(`${subscription.school} subscription cancelled.`)
      },
    })
  }

  const recordPayment = (invoice: BillingInvoice, amount: number, method: string, reason: string, approver: string) => {
    const nextStatus: BillingInvoice['status'] = amount >= invoice.amount ? 'Paid' : invoice.status
    setInvoices((current) => current.map((item) => item.id === invoice.id ? { ...item, status: nextStatus, paidAt: nextStatus === 'Paid' ? new Date().toISOString() : item.paidAt } : item))
    setPayments((current) => [{ id: `PAY-${Math.floor(6000 + Math.random() * 900)}`, invoiceId: invoice.id, school: invoice.school, amount, method: 'Bank transfer', at: new Date().toISOString(), status: 'Succeeded', failureReason: null }, ...current])
    record({
      action: 'Recorded a manual payment',
      target: `${invoice.id} · ${invoice.school}`,
      reason,
      approver: approver || undefined,
      before: `${invoice.status} · ${formatCurrency(invoice.amount)} outstanding`,
      after: nextStatus === 'Paid' ? 'Paid' : `${formatCurrency(invoice.amount - amount)} still outstanding`,
      result: 'Applied',
      options: [method],
    })
    setVerified([
      { label: 'Invoice', value: `${invoice.id} · ${invoice.school}` },
      { label: 'Amount recorded', value: formatCurrency(amount) },
      { label: 'Invoice status', value: `${invoice.status} → ${nextStatus}` },
      { label: 'Outstanding after', value: formatCurrency(Math.max(0, invoice.amount - amount)) },
    ])
    setInvoiceId(null)
    onNotify(`Payment recorded against ${invoice.id}.`)
  }

  const issueCredit = (input: { school: string; kind: 'Discount' | 'Service credit' | 'Manual adjustment'; amount: number; reason: string; approver: string }) => {
    setAdjustments((current) => [{ id: `ADJ-${Math.floor(320 + Math.random() * 80)}`, school: input.school, kind: input.kind, amount: -Math.abs(input.amount), reason: input.reason, authorizedBy: operator, at: new Date().toISOString() }, ...current])
    record({
      action: `Issued a ${input.kind.toLowerCase()}`,
      target: `${input.school} · ${formatCurrency(Math.abs(input.amount))}`,
      reason: input.reason,
      approver: input.approver || undefined,
      before: 'No adjustment',
      after: `-${formatCurrency(Math.abs(input.amount))} applied to the next invoice`,
      result: 'Applied',
    })
    setVerified([
      { label: 'School', value: input.school },
      { label: 'Adjustment', value: `${input.kind} · -${formatCurrency(Math.abs(input.amount))}` },
      { label: 'Applies to', value: 'The next invoice' },
      { label: 'Billing audit recorded', value: 'Yes — amount, reason and operator', ok: true },
    ])
    setCreditOpen(false)
    onNotify(`${input.kind} issued for ${input.school}.`)
  }

  const retryPayment = (payment: BillingPayment) => {
    setRequest({
      title: 'Retry this payment',
      target: `${payment.id} · ${payment.school}`,
      description: 'The card is charged again for the outstanding amount. The school is told either way, and repeated failures escalate to the dunning schedule.',
      confirmLabel: 'Retry payment',
      requiresReason: true,
      options: [{ key: 'notify', label: 'Tell the school administrator about the retry', defaultChecked: true }],
      onConfirm: ({ reason, options }) => {
        setPayments((current) => current.map((item) => item.id === payment.id ? { ...item, status: 'Succeeded', failureReason: null, at: new Date().toISOString() } : item))
        setInvoices((current) => current.map((item) => item.id === payment.invoiceId ? { ...item, status: 'Paid', paidAt: new Date().toISOString() } : item))
        record({
          action: 'Retried a failed payment',
          target: `${payment.id} · ${payment.school}`,
          reason,
          before: `Failed · ${payment.failureReason ?? 'unknown reason'}`,
          after: `Succeeded · ${formatCurrency(payment.amount)}`,
          result: 'Applied',
          options: options.notify ? ['School notified'] : [],
        })
        setVerified([
          { label: 'Payment', value: `${payment.id} · ${formatCurrency(payment.amount)}` },
          { label: 'Result', value: 'Failed → Succeeded' },
          { label: 'Invoice', value: `${payment.invoiceId} marked paid` },
          { label: 'School outstanding', value: formatCurrency(0) },
        ])
        onNotify(`Payment for ${payment.school} retried successfully.`)
      },
    })
  }

  const reconcile = () => {
    setRequest({
      title: 'Reconcile this period',
      target: 'Current billing period',
      description: 'Invoices issued, payments received, adjustments and the remaining balance are compared with the provider statement and signed off.',
      confirmLabel: 'Mark reconciled',
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'What did you compare, and what was the outcome?',
      onConfirm: ({ reason, approver }) => {
        record({
          action: 'Reconciled a billing period',
          target: 'Current billing period',
          reason,
          approver: approver || undefined,
          before: 'Not reconciled',
          after: 'Reconciled',
          result: 'Applied',
        })
        setVerified([
          { label: 'Period', value: 'Current month' },
          { label: 'Invoices issued', value: `${invoices.length} · ${formatCurrency(invoices.reduce((sum, invoice) => sum + invoice.amount, 0))}` },
          { label: 'Payments received', value: `${payments.filter((payment) => payment.status === 'Succeeded').length} · ${formatCurrency(collected)}` },
          { label: 'Outstanding', value: formatCurrency(outstanding), ok: outstanding === 0 },
        ])
        onNotify('Billing period marked as reconciled.')
      },
    })
  }

  const exportBilling = () => {
    downloadCsv('platform-billing.csv', [
      ['Plan', 'Monthly', 'Annual', 'Student limit', 'Teacher limit', 'Storage (GB)', 'Schools'],
      ...plans.map((plan) => [plan.name, plan.monthly, plan.annual, plan.limitStudents, plan.limitTeachers, plan.storageGb, plan.schools]),
      [],
      ['Invoice', 'School', 'Plan', 'Issued', 'Due', 'Paid', 'Amount', 'Status'],
      ...invoices.map((invoice) => [invoice.id, invoice.school, invoice.plan, invoice.issuedAt, invoice.dueAt, invoice.paidAt ?? '', invoice.amount, invoice.status]),
      [],
      ['Payment', 'Invoice', 'School', 'Amount', 'Method', 'Time', 'Status', 'Failure reason'],
      ...payments.map((payment) => [payment.id, payment.invoiceId, payment.school, payment.amount, payment.method, payment.at, payment.status, payment.failureReason ?? '']),
      [],
      ['Adjustment', 'School', 'Kind', 'Amount', 'Reason', 'Authorised by', 'At'],
      ...adjustments.map((adjustment) => [adjustment.id, adjustment.school, adjustment.kind, adjustment.amount, adjustment.reason, adjustment.authorizedBy, adjustment.at]),
    ])
    onNotify('Billing report exported.')
  }

  const subscriptionColumns: Array<Column<SchoolSubscription>> = [
    { key: 'school', label: 'School', width: 'minmax(0,1.3fr)', render: (item) => <span><span className="block font-semibold">{item.school}</span><span className="block text-xs text-graphite">{item.id} · {item.seatsUsed} seats used</span></span> },
    { key: 'plan', label: 'Plan', render: (item) => <span className="text-sm font-medium">{item.plan}</span> },
    { key: 'mrr', label: 'Monthly', render: (item) => <span className="text-sm">{item.mrr === 0 ? '—' : `${formatCurrency(item.mrr)}`}</span> },
    { key: 'renews', label: 'Renews', render: (item) => <span className="text-xs text-graphite">{item.status === 'Cancelled' ? 'Ended' : `${relativeDays(item.renewsAt)}`}</span> },
    { key: 'status', label: 'Status', render: (item) => <Pill label={item.status} /> },
  ]

  const invoiceColumns: Array<Column<BillingInvoice>> = [
    { key: 'invoice', label: 'Invoice', width: 'minmax(0,1.1fr)', render: (invoice) => <span><span className="block font-semibold">{invoice.id}</span><span className="block text-xs text-graphite">{invoice.school} · {invoice.plan}</span></span> },
    { key: 'amount', label: 'Amount', render: (invoice) => <span className="text-sm font-medium">{invoice.amount === 0 ? 'Trial' : formatCurrency(invoice.amount)}</span> },
    { key: 'issued', label: 'Issued', render: (invoice) => <span className="text-xs text-graphite">{stamp(invoice.issuedAt)}</span> },
    { key: 'due', label: 'Due', render: (invoice) => <span className="text-xs text-graphite">{relativeDays(invoice.dueAt)}</span> },
    { key: 'status', label: 'Status', render: (invoice) => <Pill label={invoice.status} /> },
  ]

  const paymentColumns: Array<Column<BillingPayment>> = [
    { key: 'payment', label: 'Payment', width: 'minmax(0,1.1fr)', render: (payment) => <span><span className="block font-semibold">{payment.id}</span><span className="block text-xs text-graphite">{payment.school} · {payment.invoiceId}</span></span> },
    { key: 'amount', label: 'Amount', render: (payment) => <span className="text-sm">{formatCurrency(payment.amount)}</span> },
    { key: 'method', label: 'Method', render: (payment) => <span className="text-sm">{payment.method}</span> },
    { key: 'status', label: 'Status', render: (payment) => <Pill label={payment.status} /> },
    { key: 'reason', label: 'Reason', width: 'minmax(0,1.2fr)', render: (payment) => <span className="text-xs text-graphite">{payment.failureReason ?? '—'}</span> },
    { key: 'when', label: 'When', render: (payment) => <span className="text-xs text-graphite">{timeAgo(payment.at)}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Commercial operations"
        title="Billing"
        description="Plans, subscriptions, invoices and payments — with the adjustments and audit trail that explain every number."
        action={<ExportButton onClick={exportBilling} label="Export report" />}
      />
      <PrototypeNotice
        scope="Billing"
        detail="The tables exist — subscription_plans and school_subscriptions — but both are empty and nothing in the product writes to them, so there are no plans or renewals to show. Every plan, subscription, invoice, payment and adjustment here is sample data; the upgrade, cancellation, credit and reconciliation controls are the ones the real screen will use."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Monthly recurring revenue" value={formatCurrency(mrr)} detail={`${subscriptions.filter((item) => item.status === 'Active').length} active subscriptions`} icon={CurrencyDollar} />
        <KpiTile label="Collected this month" value={formatCurrency(collected)} detail={`${payments.filter((payment) => payment.status === 'Succeeded').length} successful payments`} icon={CreditCard} tone="success" />
        <KpiTile label="Outstanding balance" value={formatCurrency(outstanding)} detail={`${invoices.filter((invoice) => invoice.status === 'Overdue').length} overdue invoices`} icon={Receipt} tone={outstanding ? 'warning' : 'success'} />
        <KpiTile label="Failed payments" value={failedPayments.length.toString()} detail={failedPayments.map((payment) => payment.school).join(', ') || 'No failed payment'} icon={Warning} tone={failedPayments.length ? 'danger' : 'success'} />
      </div>

      <div className="mt-6">
        <Panel
          title="Plans"
          description="Price, interval and the limits a school gets."
          action={<SampleTag />}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-ink/[0.08] p-4 dark:border-white/[0.08]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="mt-1 text-xs text-graphite">{plan.schools} schools on this plan</p>
                  </div>
                  <Pill label="Monthly" tone="neutral" />
                </div>
                <p className="mt-4 text-2xl font-semibold">{formatCurrency(plan.monthly)}<span className="text-sm font-normal text-graphite"> / month</span></p>
                <p className="mt-1 text-xs text-graphite">{formatCurrency(plan.annual)} billed annually</p>
                <ul className="mt-4 space-y-1 text-xs text-graphite">
                  <li>{plan.limitStudents.toLocaleString()} students</li>
                  <li>{plan.limitTeachers} teachers</li>
                  <li>{plan.storageGb} GB storage</li>
                </ul>
                <ul className="mt-3 space-y-1 text-xs">
                  {plan.features.map((feature) => <li key={feature} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-brand" />{feature}</li>)}
                </ul>
                <button onClick={() => setPlanEdit(plan)} className="mt-4 text-xs font-semibold text-brand">Edit plan</button>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips options={subscriptionStatuses} value={subStatus} onChange={setSubStatus} label="Subscription status" />
          <FilterChips options={invoiceStatuses} value={invoiceStatus} onChange={setInvoiceStatus} label="Invoice status" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreditOpen(true)}><CurrencyDollar className="h-4 w-4" /> Issue credit</Button>
            <Button variant="accent" size="sm" onClick={reconcile}><Check className="h-4 w-4" /> Reconcile period</Button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <Panel title="School subscriptions" description="Open a subscription to change the plan or cancel it." action={<SampleTag />}>
          <DataTable columns={subscriptionColumns} rows={visibleSubscriptions} rowKey={(item) => item.id} onRow={(item) => setSubscriptionId(item.id)} emptyLabel="No subscriptions match this filter." />
        </Panel>

        <Panel title="Invoices" description="Open an invoice to record a payment or void it." action={<SampleTag />}>
          <DataTable columns={invoiceColumns} rows={visibleInvoices} rowKey={(invoice) => invoice.id} onRow={(invoice) => setInvoiceId(invoice.id)} emptyLabel="No invoices match this filter." />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Payments" description="Failed payments can be retried here; every attempt is recorded." action={<SampleTag />}>
          <DataTable columns={paymentColumns} rows={payments} rowKey={(payment) => payment.id} renderActions={(payment) => (
            payment.status === 'Failed'
              ? <button onClick={() => retryPayment(payment)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10">Retry</button>
              : <span className="text-xs text-graphite">{payment.status === 'Refunded' ? 'Refunded' : 'Settled'}</span>
          )} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Discounts, credits and adjustments" description="Every manual change to what a school owes." action={<SampleTag />}>
            <ul className="space-y-3">
              {adjustments.map((adjustment) => (
                <li key={adjustment.id} className="border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-semibold">{adjustment.school}</span>
                    <Pill label={adjustment.kind} tone="info" />
                    <span className={cn('text-sm font-semibold', adjustment.amount < 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-ink dark:text-white')}>{adjustment.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(adjustment.amount))}</span>
                  </div>
                  <p className="mt-1 text-xs text-graphite">{adjustment.reason} · authorised by {adjustment.authorizedBy} · {timeAgo(adjustment.at)}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Reconciliation" description="Issued against received, for the current period." action={<SampleTag />}>
            <MetaList
              columns={1}
              items={[
                ['Invoices issued', `${invoices.length} · ${formatCurrency(invoices.reduce((sum, invoice) => sum + invoice.amount, 0))}`],
                ['Payments received', `${payments.filter((payment) => payment.status === 'Succeeded').length} · ${formatCurrency(payments.filter((payment) => payment.status === 'Succeeded').reduce((sum, payment) => sum + payment.amount, 0))}`],
                ['Adjustments', `${adjustments.length} · ${formatCurrency(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0))}`],
                ['Still outstanding', formatCurrency(outstanding)],
                ['Reconciliation state', 'Not reconciled for this period'],
              ]}
            />
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Plan, subscription, payment and credit changes from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="A real provider confirmation would also show the transaction reference in the payments list." />
          : <Panel title="Verify the result" description="Every billing action reports what changed."><p className="text-sm text-graphite">Change a plan, record a payment or issue a credit to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selectedSubscription)}
        onClose={() => setSubscriptionId(null)}
        title={selectedSubscription?.school ?? ''}
        description={selectedSubscription ? `${selectedSubscription.id} · ${selectedSubscription.plan} · ${selectedSubscription.status}` : ''}
        summary={selectedSubscription && (
          <Callout tone={selectedSubscription.status === 'Active' ? 'success' : selectedSubscription.status === 'Past due' ? 'danger' : 'warning'} title={`${selectedSubscription.plan} · ${selectedSubscription.mrr === 0 ? 'no charge' : `${formatCurrency(selectedSubscription.mrr)} per month`}`}>
            {selectedSubscription.status === 'Past due'
              ? 'Payment is late. The school keeps access during the grace period; a failed payment is retried on the dunning schedule.'
              : `Renews ${relativeDays(selectedSubscription.renewsAt)}. Plan changes are prorated from the next invoice.`}
          </Callout>
        )}
        meta={selectedSubscription ? [
          ['Plan', selectedSubscription.plan],
          ['Status', <Pill key="status" label={selectedSubscription.status} />],
          ['Monthly amount', selectedSubscription.mrr === 0 ? 'Trial' : formatCurrency(selectedSubscription.mrr)],
          ['Started', `${stamp(selectedSubscription.startedAt)} · ${relativeDays(selectedSubscription.startedAt)}`],
          ['Renews', `${stamp(selectedSubscription.renewsAt)} · ${relativeDays(selectedSubscription.renewsAt)}`],
          ['Seats used', selectedSubscription.seatsUsed.toLocaleString()],
        ] : []}
        footer={selectedSubscription && (
          <>
            <Button variant="outline" size="sm" onClick={() => {
              setRequest({
                title: 'Change the plan',
                target: `${selectedSubscription.school} · ${selectedSubscription.plan}`,
                description: 'Upgrades apply immediately and are prorated. Downgrades take effect at the next renewal so a school never loses features it has paid for.',
                confirmLabel: 'Continue',
                requiresReason: true,
                reasonLabel: 'Why is the plan changing?',
                onConfirm: ({ reason }) => {
                  const currentIndex = plans.findIndex((plan) => plan.name === selectedSubscription.plan)
                  const nextPlan = plans[Math.min(currentIndex + 1, plans.length - 1)]?.name ?? selectedSubscription.plan
                  changePlan(selectedSubscription, nextPlan, reason, '', { notify: true, prorate: true })
                },
              })
            }}><ArrowsDownUp className="h-4 w-4" /> Change plan</Button>
            {selectedSubscription.status !== 'Cancelled' && (
              <Button variant="danger" size="sm" onClick={() => cancelSubscription(selectedSubscription)}><Warning className="h-4 w-4" /> Cancel subscription</Button>
            )}
          </>
        )}
        size="lg"
      >
        {selectedSubscription && (
          <MetaList
            columns={1}
            items={[
              ['Proration', 'A change mid-period charges or credits the difference on the next invoice, calculated from the unused days.'],
              ['What the backend needs', 'school_subscriptions rows with plan_id and status, plus a price table. Both tables exist and are empty.'],
            ]}
          />
        )}
      </DetailModal>

      <DetailModal
        open={Boolean(selectedInvoice)}
        onClose={() => setInvoiceId(null)}
        title={selectedInvoice?.id ?? ''}
        description={selectedInvoice ? `${selectedInvoice.school} · ${selectedInvoice.plan}` : ''}
        summary={selectedInvoice && (
          <Callout tone={selectedInvoice.status === 'Paid' ? 'success' : selectedInvoice.status === 'Overdue' ? 'danger' : 'warning'} title={`${selectedInvoice.status} · ${selectedInvoice.amount === 0 ? 'Trial, no charge due' : formatCurrency(selectedInvoice.amount)}`}>
            {selectedInvoice.paidAt ? `Paid ${relativeDays(selectedInvoice.paidAt)}.` : `Due ${relativeDays(selectedInvoice.dueAt)}.`}
          </Callout>
        )}
        meta={selectedInvoice ? [
          ['Issued', `${stamp(selectedInvoice.issuedAt)} · ${relativeDays(selectedInvoice.issuedAt)}`],
          ['Due', `${stamp(selectedInvoice.dueAt)} · ${relativeDays(selectedInvoice.dueAt)}`],
          ['Paid', selectedInvoice.paidAt ? stamp(selectedInvoice.paidAt) : 'Not paid'],
          ['Amount', selectedInvoice.amount === 0 ? 'Trial' : formatCurrency(selectedInvoice.amount)],
          ['Status', <Pill key="status" label={selectedInvoice.status} />],
          ['Payments against it', payments.filter((payment) => payment.invoiceId === selectedInvoice.id).length.toString()],
        ] : []}
        footer={selectedInvoice && selectedInvoice.status !== 'Paid' && (
          <Button variant="accent" size="sm" onClick={() => recordPayment(selectedInvoice, selectedInvoice.amount, 'Bank transfer', 'Payment received outside the provider and confirmed by the school.', '')}>
            <Receipt className="h-4 w-4" /> Record payment
          </Button>
        )}
        size="md"
      >
        {selectedInvoice && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Payments against this invoice</p>
            <ul className="space-y-2">
              {payments.filter((payment) => payment.invoiceId === selectedInvoice.id).map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.035] p-3 text-sm dark:bg-white/[0.05]">
                  <Pill label={payment.status} />
                  <span className="min-w-0 flex-1 text-xs text-graphite">{payment.method} · {formatCurrency(payment.amount)} · {timeAgo(payment.at)}</span>
                  {payment.status === 'Failed' && <button onClick={() => retryPayment(payment)} className="text-xs font-semibold text-brand">Retry</button>}
                </li>
              ))}
              {payments.filter((payment) => payment.invoiceId === selectedInvoice.id).length === 0 && <li className="text-sm text-graphite">No payment attempt recorded.</li>}
            </ul>
          </div>
        )}
      </DetailModal>

      <CreditModal open={creditOpen} schools={subscriptions.map((item) => item.school)} onClose={() => setCreditOpen(false)} onIssue={issueCredit} />

      <PlanEditModal plan={planEdit} onClose={() => setPlanEdit(null)} onSave={(plan, monthly, students, teachers, storage, reason) => {
        setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, monthly, annual: monthly * 10, limitStudents: students, limitTeachers: teachers, storageGb: storage } : item))
        record({
          action: 'Changed a plan definition',
          target: `${plan.name} plan`,
          reason,
          before: `${formatCurrency(plan.monthly)} · ${plan.limitStudents} students · ${plan.storageGb} GB`,
          after: `${formatCurrency(monthly)} · ${students} students · ${storage} GB`,
          result: 'Applied',
        })
        setVerified([
          { label: 'Plan', value: plan.name },
          { label: 'Monthly price', value: `${formatCurrency(plan.monthly)} → ${formatCurrency(monthly)}` },
          { label: 'Student limit', value: `${plan.limitStudents} → ${students}` },
          { label: 'Existing subscriptions', value: `${plan.schools} schools keep their current price until renewal` },
        ])
        setPlanEdit(null)
        onNotify(`${plan.name} plan updated.`)
      }} />

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 text-xs text-graphite">
        All Nom Cloud plans are billed in US Dollars. Amounts on this screen are sample data until subscription_plans and school_subscriptions hold real rows.
      </p>
    </>
  )
}

function CreditModal({ open, schools, onClose, onIssue }: {
  open: boolean
  schools: string[]
  onClose: () => void
  onIssue: (input: { school: string; kind: 'Discount' | 'Service credit' | 'Manual adjustment'; amount: number; reason: string; approver: string }) => void
}) {
  const [school, setSchool] = useState(schools[0] ?? '')
  const [kind, setKind] = useState<'Discount' | 'Service credit' | 'Manual adjustment'>('Service credit')
  const [amount, setAmount] = useState('100')
  const [reason, setReason] = useState('')
  const [approver, setApprover] = useState('')
  const [error, setError] = useState<string | null>(null)

  const value = Number(amount) || 0
  const needsApproval = value > 500

  const submit = () => {
    if (!school) { setError('Choose a school.'); return }
    if (value <= 0) { setError('Enter an amount above zero.'); return }
    if (reason.trim().length < 8) { setError('Write a short reason (8 characters).'); return }
    if (needsApproval && !approver) { setError('Adjustments above $500 need a second operator.'); return }
    onIssue({ school, kind, amount: value, reason: reason.trim(), approver })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Issue a credit or discount"
      description="Adjustments reduce what a school owes on its next invoice, and are part of the billing audit trail."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={submit}>Issue adjustment</Button></>}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">School</span>
          <select value={school} onChange={(event) => setSchool(event.target.value)} className="input py-2">{schools.map((option) => <option key={option} value={option}>{option}</option>)}</select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="input py-2">
              {['Service credit', 'Discount', 'Manual adjustment'].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Amount (USD)</span><input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="input" /></label>
        </div>
        <label className="block">
          <span className="label">Reason (kept with the adjustment)</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="input resize-none" placeholder="Delivery was interrupted for three days in August." />
        </label>
        {needsApproval && (
          <Callout tone="warning" title="Above the approval threshold">
            Adjustments above $500 need a second operator. Both names are recorded with the adjustment.
            <label className="mt-3 block">
              <span className="label">Second operator</span>
              <select value={approver} onChange={(event) => setApprover(event.target.value)} className="input py-2">
                <option value="">Select an operator…</option>
                {['Leila Hassan', 'Amina Yusuf', 'Grace Wanjiru', 'Tom Bwire'].map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </Callout>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}

function PlanEditModal({ plan, onClose, onSave }: {
  plan: typeof billingPlans[number] | null
  onClose: () => void
  onSave: (plan: typeof billingPlans[number], monthly: number, students: number, teachers: number, storage: number, reason: string) => void
}) {
  const [monthly, setMonthly] = useState(String(plan?.monthly ?? 0))
  const [students, setStudents] = useState(String(plan?.limitStudents ?? 0))
  const [teachers, setTeachers] = useState(String(plan?.limitTeachers ?? 0))
  const [storage, setStorage] = useState(String(plan?.storageGb ?? 0))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!plan) return null

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Edit the ${plan.name} plan`}
      description={`${plan.schools} schools are on this plan today.`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={() => {
        if (reason.trim().length < 8) { setError('Write a short reason (8 characters).'); return }
        onSave(plan, Number(monthly) || 0, Number(students) || 0, Number(teachers) || 0, Number(storage) || 0, reason.trim())
      }}>Save plan</Button></>}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Monthly price (USD)</span><input type="number" min="0" value={monthly} onChange={(event) => setMonthly(event.target.value)} className="input" /></label>
          <label className="block"><span className="label">Student limit</span><input type="number" min="0" value={students} onChange={(event) => setStudents(event.target.value)} className="input" /></label>
          <label className="block"><span className="label">Teacher limit</span><input type="number" min="0" value={teachers} onChange={(event) => setTeachers(event.target.value)} className="input" /></label>
          <label className="block"><span className="label">Storage (GB)</span><input type="number" min="0" value={storage} onChange={(event) => setStorage(event.target.value)} className="input" /></label>
        </div>
        <label className="block">
          <span className="label">Reason (recorded in the billing audit)</span>
          <textarea value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }} rows={3} className="input resize-none" placeholder="Annual price review for the Growth plan." />
        </label>
        <Callout tone="info" title="Existing subscriptions">
          A price change applies to new subscriptions immediately and to existing schools at their next renewal. Existing schools keep their current price until
          then.
        </Callout>
        {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
