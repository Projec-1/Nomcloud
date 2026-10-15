import { useMemo, useState } from 'react'
import { ArrowCounterClockwise as RotateCcw, Check, Flag, ShieldCheck, Sliders, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { cn } from '@/utils/cn'
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
  Timeline,
  VerificationPanel,
  downloadCsv,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import { featureFlags, sampleSchools, type FeatureFlag } from './prototypeData'
import { timeAgo } from '@/utils/format'

const statusOptions = ['All', 'Enabled', 'Beta', 'Disabled', 'Coming soon'] as const
const plans = ['Starter', 'Growth', 'Enterprise'] as const
const rolloutSteps = [0, 10, 25, 50, 100]

export default function FeaturesSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [flags, setFlags] = useState<FeatureFlag[]>(featureFlags)
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('All')
  const [flagId, setFlagId] = useState<string | null>(null)
  const [rolloutFor, setRolloutFor] = useState<FeatureFlag | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const visible = useMemo(() => flags.filter((flag) => status === 'All' || flag.status === status), [flags, status])
  const selected = useMemo(() => flags.find((flag) => flag.id === flagId) ?? null, [flags, flagId])
  const unenforced = flags.filter((flag) => flag.enforcement === 'UI only' && (flag.status === 'Enabled' || flag.status === 'Beta'))

  const applyRollout = (flag: FeatureFlag, input: { rollout: number; plans: string[]; scope: string; reason: string; approver: string; options: Record<string, boolean> }, mode: 'apply' | 'rollback') => {
    const nextPercent = mode === 'rollback' ? 0 : input.rollout
    const nextStatus: FeatureFlag['status'] = mode === 'rollback'
      ? 'Disabled'
      : nextPercent === 0 ? 'Disabled' : nextPercent === 100 ? 'Enabled' : 'Beta'
    setFlags((current) => current.map((item) => item.id === flag.id
      ? {
        ...item,
        rolloutPercent: nextPercent,
        plans: input.plans,
        scope: mode === 'rollback' ? 'Rolled back to no schools' : input.scope,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        history: [...item.history, { at: new Date().toISOString(), actor: operator, change: mode === 'rollback' ? `Rolled back from ${item.rolloutPercent}% to 0%` : `Rollout set to ${nextPercent}%` }],
      }
      : item))
    record({
      action: mode === 'rollback' ? 'Rolled back a feature rollout' : 'Changed a feature rollout',
      target: `${flag.key} · ${flag.name}`,
      reason: input.reason,
      approver: input.approver || undefined,
      before: `${flag.status} · ${flag.rolloutPercent}% · ${flag.plans.join(', ') || 'no plan'}`,
      after: `${nextStatus} · ${nextPercent}% · ${input.plans.join(', ') || 'no plan'}`,
      result: 'Applied',
    })
    setVerified([
      { label: 'Feature', value: `${flag.name} (${flag.key})` },
      { label: 'Rollout', value: `${flag.rolloutPercent}% → ${nextPercent}%` },
      { label: 'Status', value: `${flag.status} → ${nextStatus}` },
      { label: 'Enforced in backend', value: flag.enforcement, ok: flag.enforcement === 'Enforced in backend' },
      { label: 'Plans', value: input.plans.length ? input.plans.join(', ') : 'No plan' },
    ])
    setFlagId(null)
    setRolloutFor(null)
    onNotify(mode === 'rollback' ? `${flag.name} rolled back.` : `${flag.name} rollout updated.`)
  }

  const markEnforced = (flag: FeatureFlag) => {
    setRequest({
      title: 'Record backend enforcement for this flag',
      target: `${flag.key} · ${flag.name}`,
      description: 'A flag that only hides a button can be bypassed by calling the API directly. Recording enforcement confirms the server checks the same flag before doing the work.',
      confirmLabel: 'Record enforcement',
      requiresReason: true,
      reasonLabel: 'Where is the flag checked on the server?',
      onConfirm: ({ reason }) => {
        setFlags((current) => current.map((item) => item.id === flag.id ? { ...item, enforcement: 'Enforced in backend', history: [...item.history, { at: new Date().toISOString(), actor: operator, change: 'Backend enforcement recorded' }] } : item))
        record({
          action: 'Recorded backend enforcement for a feature flag',
          target: `${flag.key} · ${flag.name}`,
          reason,
          before: 'UI only',
          after: 'Enforced in backend',
          result: 'Applied',
        })
        setVerified([
          { label: 'Feature', value: flag.name },
          { label: 'Enforcement', value: 'UI only → Enforced in backend' },
          { label: 'Where the check runs', value: reason.length > 70 ? `${reason.slice(0, 70)}…` : reason },
          { label: 'Rollout unaffected', value: `Still ${flag.rolloutPercent}%`, ok: true },
        ])
        setFlagId(null)
        onNotify(`${flag.name} marked as enforced in the backend.`)
      },
    })
  }

  const exportFlags = () => {
    downloadCsv('platform-feature-flags.csv', [
      ['Key', 'Feature', 'Status', 'Rollout %', 'Plans', 'Scope', 'Adoption %', 'Open errors', 'Enforcement', 'Owner', 'Last changed'],
      ...flags.map((flag) => [flag.key, flag.name, flag.status, flag.rolloutPercent, flag.plans.join(' / '), flag.scope, flag.adoptionPercent ?? '—', flag.openErrors, flag.enforcement, flag.owner, flag.updatedAt]),
    ])
    onNotify('Feature registry exported.')
  }

  const columns: Array<Column<FeatureFlag>> = [
    { key: 'name', label: 'Feature', width: 'minmax(0,1.4fr)', render: (flag) => <span><span className="block font-semibold">{flag.name}</span><span className="block text-xs text-graphite">{flag.key}</span></span> },
    { key: 'status', label: 'Status', render: (flag) => <Pill label={flag.status} /> },
    { key: 'rollout', label: 'Rollout', render: (flag) => <span className="text-sm">{flag.rolloutPercent}%<span className="block text-xs text-graphite">{flag.plans.join(', ') || 'No plan'}</span></span> },
    { key: 'scope', label: 'Scope', render: (flag) => <span className="text-xs text-graphite">{flag.scope}</span> },
    { key: 'adoption', label: 'Adoption', render: (flag) => <span className="text-sm">{flag.adoptionPercent === null ? '—' : `${flag.adoptionPercent}%`}</span> },
    { key: 'errors', label: 'Open errors', render: (flag) => <span className={cn('text-sm', flag.openErrors > 0 && 'font-semibold text-red-600 dark:text-red-300')}>{flag.openErrors}</span> },
    { key: 'enforcement', label: 'Enforcement', render: (flag) => <Pill label={flag.enforcement} /> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Product control"
        title="Features"
        description="What each school can use, how far a rollout has gone, and whether the platform actually enforces it."
        action={<ExportButton onClick={exportFlags} label="Export registry" />}
      />
      <PrototypeNotice
        scope="Features"
        detail="There is no feature-flag table. The nearest thing is three per-school switches on the schools row, which an administrator controls for their own school. The registry below is the interface a real flag store will use: rollouts, plan scoping and rollbacks all work here and are recorded, and none of them change what a school can actually do yet."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Features enabled" value={flags.filter((flag) => flag.status === 'Enabled').length.toString()} detail={`${flags.filter((flag) => flag.status === 'Beta').length} in beta · ${flags.filter((flag) => flag.status === 'Disabled').length} disabled`} icon={Flag} tone="success" />
        <KpiTile label="Controlled rollouts" value={flags.filter((flag) => flag.rolloutPercent > 0 && flag.rolloutPercent < 100).length.toString()} detail="Live with only some schools" icon={Sliders} tone="warning" />
        <KpiTile label="Open errors on live flags" value={flags.filter((flag) => flag.status !== 'Disabled' && flag.status !== 'Coming soon').reduce((sum, flag) => sum + flag.openErrors, 0).toString()} detail="Errors reported against a released feature" icon={Warning} tone={flags.some((flag) => flag.openErrors > 0) ? 'danger' : 'success'} />
        <KpiTile label="Not enforced in backend" value={unenforced.length.toString()} detail={unenforced.map((flag) => flag.name).join(', ') || 'Every live flag is checked by the server'} icon={ShieldCheck} tone={unenforced.length ? 'warning' : 'success'} />
      </div>

      <div className="mt-6">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Feature status" />
      </div>

      <div className="mt-5">
        <Panel title="Feature registry" description="Open a feature to change its rollout, its plans or its status." action={<SampleTag />}>
          <DataTable columns={columns} rows={visible} rowKey={(flag) => flag.id} onRow={(flag) => setFlagId(flag.id)} emptyLabel="No features match this filter." />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Backend enforcement" description="Hiding a button is not access control." action={<SampleTag />}>
          <Callout tone={unenforced.length ? 'warning' : 'success'} title={unenforced.length ? `${unenforced.length} live feature${unenforced.length === 1 ? '' : 's'} are only hidden in the interface` : 'Every live feature is enforced by the server'}>
            A flag that only removes a button or a page can still be used by calling the API directly with a school that has no entitlement. Before a feature is
            released to every school, the same flag has to be checked on the server, in the query that returns the data.
          </Callout>
          <ul className="mt-4 space-y-3">
            {flags.map((flag) => (
              <li key={flag.id} className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] pb-3 text-sm last:border-0 last:pb-0 dark:border-white/[0.08]">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{flag.name}</span>
                  <span className="block text-xs text-graphite">{flag.key} · {flag.status} · {flag.rolloutPercent}% of schools</span>
                </span>
                <Pill label={flag.enforcement} />
                {flag.enforcement === 'UI only' && (
                  <button onClick={() => markEnforced(flag)} className="text-xs font-semibold text-brand">Record enforcement</button>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Plan availability" description="Which plan a feature belongs to before any per-school override." action={<SampleTag />}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/[0.07] text-[10px] font-bold uppercase tracking-[0.15em] text-graphite dark:border-white/[0.08]">
                  <th className="py-2">Feature</th>
                  {plans.map((plan) => <th key={plan} className="py-2">{plan}</th>)}
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.id} className="border-b border-ink/[0.06] last:border-0 dark:border-white/[0.08]">
                    <td className="py-2.5 font-medium">{flag.name}</td>
                    {plans.map((plan) => (
                      <td key={plan} className="py-2.5">
                        {flag.plans.includes(plan) ? <Pill label="Included" tone="success" /> : <Pill label="Not included" tone="neutral" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Rollout, rollback and enforcement changes from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="Enforcement is confirmed by the backend, not by this screen. A flag marked “UI only” should not be released to every school." />
          : <Panel title="Verify the result" description="Every rollout change reports what changed."><p className="text-sm text-graphite">Change a rollout, scope a feature to plans or record enforcement to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selected)}
        onClose={() => setFlagId(null)}
        title={selected?.name ?? ''}
        description={selected ? `${selected.key} · owner ${selected.owner}` : ''}
        summary={selected && (
          <Callout tone={selected.status === 'Enabled' ? 'success' : selected.status === 'Beta' ? 'warning' : 'info'} title={`${selected.status} · ${selected.rolloutPercent}% of schools`}>
            {selected.description}
          </Callout>
        )}
        meta={selected ? [
          ['Status', <Pill key="status" label={selected.status} />],
          ['Rollout', `${selected.rolloutPercent}%`],
          ['Scope', selected.scope],
          ['Plans', selected.plans.join(', ') || 'No plan'],
          ['Adoption', selected.adoptionPercent === null ? 'Not released' : `${selected.adoptionPercent}% of eligible schools`],
          ['Open errors', selected.openErrors.toString()],
          ['Enforcement', <Pill key="enforcement" label={selected.enforcement} />],
          ['Last changed', `${stamp(selected.updatedAt)} · ${timeAgo(selected.updatedAt)}`],
        ] : []}
        footer={selected && (
          <>
            <Button variant="outline" size="sm" onClick={() => { setRolloutFor(selected); setFlagId(null) }}><Sliders className="h-4 w-4" /> Change rollout</Button>
            {selected.enforcement === 'UI only' && <Button variant="outline" size="sm" onClick={() => markEnforced(selected)}><ShieldCheck className="h-4 w-4" /> Record enforcement</Button>}
            {selected.rolloutPercent > 0 && (
              <Button
                variant="danger"
                size="sm"
                disabled={selected.enforcement === 'UI only' && selected.rolloutPercent === 100}
                onClick={() => setRequest({
                  title: 'Roll back this feature rollout',
                  target: `${selected.key} · ${selected.name}`,
                  description: 'Schools lose the feature immediately. The rollout history keeps the previous value so the decision can be reviewed.',
                  confirmLabel: 'Roll back rollout',
                  danger: true,
                  requiresReason: true,
                  requiresApproval: true,
                  reasonLabel: 'What is going wrong, and what will be done instead?',
                  onConfirm: ({ reason, approver }) => applyRollout(selected, { rollout: 0, plans: selected.plans, scope: selected.scope, reason, approver, options: {} }, 'rollback'),
                })}
              >
                <RotateCcw className="h-4 w-4" /> Roll back
              </Button>
            )}
          </>
        )}
        size="lg"
      >
        {selected && (
          <>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-graphite">Rollout history</p>
              <Timeline entries={[...selected.history].reverse().map((entry) => ({ at: entry.at, title: entry.change, by: entry.actor }))} />
            </div>
            {selected.enforcement === 'UI only' && (
              <Callout tone="warning" title="This feature is not enforced by the server">
                Anyone who can call the API with a school that should not have this feature can still use it. Record enforcement before widening the rollout.
              </Callout>
            )}
            <MetaList
              columns={1}
              items={[
                ['Rollout groups', `A rollout can start with ${sampleSchools.length} sample schools and grow in steps. Each step keeps the previous group so a rollback is a setting change, not a redeploy.`],
                ['Adoption and errors', 'Adoption is the share of eligible schools that used the feature at least once; errors are counted per release so a bad version is visible.'],
                ['What is missing', 'No flag table, no per-school override table and no error counter. Every value here is sample data.'],
              ]}
            />
            <p className="flex items-center gap-2 text-xs text-graphite"><Check className="h-3.5 w-3.5" /> Rollbacks are always available and always recorded.</p>
          </>
        )}
      </DetailModal>

      {rolloutFor && (
        <RolloutModal
          flag={rolloutFor}
          onClose={() => setRolloutFor(null)}
          onApply={(input) => {
            setRequest({
              title: 'Change a feature rollout',
              target: `${rolloutFor.key} · ${rolloutFor.name}`,
              description: input.rollout === 100
                ? 'Every school on the selected plans gets this feature. A feature that is only enforced in the interface should not be released this far.'
                : `The feature is available to ${input.rollout}% of the selected schools.`,
              confirmLabel: 'Apply rollout',
              requiresReason: true,
              requiresApproval: input.rollout === 100,
              reasonLabel: 'Why is the rollout changing?',
              onConfirm: ({ reason, approver }) => applyRollout(rolloutFor, { ...input, reason, approver }, 'apply'),
            })
          }}
        />
      )}

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />

      <p className="mt-6 text-xs text-graphite">
        {plans.join(' · ')} plans are the sample plan set. Real plan definitions live in subscription_plans, which is empty today.
      </p>
    </>
  )
}

function RolloutModal({ flag, onClose, onApply }: { flag: FeatureFlag; onClose: () => void; onApply: (input: { rollout: number; plans: string[]; scope: string; options: Record<string, boolean> }) => void }) {
  const [rollout, setRollout] = useState(flag.rolloutPercent)
  const [selectedPlans, setSelectedPlans] = useState<string[]>(flag.plans)
  const [scope, setScope] = useState(flag.scope)
  const [staged, setStaged] = useState(true)

  const togglePlan = (plan: string) => setSelectedPlans((current) => current.includes(plan) ? current.filter((item) => item !== plan) : [...current, plan])

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Change this rollout"
      description={`${flag.name} · currently ${flag.rolloutPercent}%`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" onClick={() => onApply({ rollout, plans: selectedPlans, scope, options: { staged } })}>Continue</Button></>}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="label">Rollout share</legend>
          <div className="flex flex-wrap gap-2">
            {rolloutSteps.map((step) => (
              <button key={step} type="button" onClick={() => setRollout(step)} className={cn('rounded-xl border px-4 py-2 text-sm font-semibold', rollout === step ? 'border-brand/40 bg-brand/[0.06] text-brand' : 'border-ink/10 dark:border-white/10')}>{step}%</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-graphite">
            {rollout === 0 && 'The feature is off everywhere unless a school is granted it individually.'}
            {rollout > 0 && rollout < 100 && `${rollout}% of schools on the selected plans get the feature. Rollout history keeps the previous share.`}
            {rollout === 100 && 'Every school on the selected plans gets the feature. This needs a second operator.'}
          </p>
        </fieldset>

        <fieldset>
          <legend className="label">Plans</legend>
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => (
              <button key={plan} type="button" onClick={() => togglePlan(plan)} className={cn('rounded-xl border px-4 py-2 text-sm font-semibold', selectedPlans.includes(plan) ? 'border-brand/40 bg-brand/[0.06] text-brand' : 'border-ink/10 dark:border-white/10')}>{plan}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-graphite">No school can use the feature unless its plan is selected and the rollout share covers it.</p>
        </fieldset>

        <label className="block">
          <span className="label">Scope note</span>
          <input value={scope} onChange={(event) => setScope(event.target.value)} className="input" placeholder="Pilot group of 4 schools" />
          <span className="mt-1 block text-xs text-graphite">Describes who the rollout covers. Per-school overrides come later.</span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={staged} onChange={(event) => setStaged(event.target.checked)} className="mt-1 h-4 w-4 rounded border-ink/20" />
          <span>
            <span className="block font-semibold">Stage the rollout and watch errors first</span>
            <span className="block text-xs text-graphite">Errors are counted per release. If they rise above the threshold, the rollout pauses and an operator is told.</span>
          </span>
        </label>

        {flag.enforcement === 'UI only' && (
          <Callout tone="warning" title="Not enforced in the backend">
            This feature is hidden by the interface only. Widening the rollout before the server checks the same flag exposes it to schools that should not have
            it.
          </Callout>
        )}
      </div>
    </Modal>
  )
}
