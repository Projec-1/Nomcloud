import { useMemo, useState } from 'react'
import { ArrowClockwise as RefreshCw, Check, Key as KeyRound, PlugsConnected, Pulse as Activity, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import {
  ActionDialog,
  ActionLogPanel,
  Callout,
  DataTable,
  DetailModal,
  ExportButton,
  KpiTile,
  MetaList,
  Panel,
  Pill,
  PrototypeNotice,
  SampleTag,
  SectionHeader,
  VerificationPanel,
  downloadCsv,
  stamp,
  useActionLog,
  type ActionRequest,
  type Column,
} from './PrototypeKit'
import {
  integrations,
  webhookDeliveries,
  webhookEndpoints,
  type Integration,
  type WebhookDelivery,
  type WebhookEndpoint,
} from './prototypeData'
import { timeAgo } from '@/utils/format'

export default function IntegrationsSection({ onNotify, operator }: { onNotify: (message: string) => void; operator: string }) {
  const [providers, setProviders] = useState<Integration[]>(integrations)
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(webhookEndpoints)
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>(webhookDeliveries)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [endpointId, setEndpointId] = useState<string | null>(null)
  const [deliveryId, setDeliveryId] = useState<string | null>(null)
  const [request, setRequest] = useState<ActionRequest | null>(null)
  const [verified, setVerified] = useState<Array<{ label: string; value: string; ok?: boolean }> | null>(null)
  const { entries, record } = useActionLog(operator)

  const selectedProvider = useMemo(() => providers.find((item) => item.id === providerId) ?? null, [providers, providerId])
  const selectedEndpoint = useMemo(() => endpoints.find((item) => item.id === endpointId) ?? null, [endpoints, endpointId])
  const selectedDelivery = useMemo(() => deliveries.find((item) => item.id === deliveryId) ?? null, [deliveries, deliveryId])

  const failingEndpoints = endpoints.filter((endpoint) => endpoint.status === 'Failing')
  const failedDeliveries = deliveries.filter((delivery) => delivery.outcome === 'Failed')

  const testConnection = (provider: Integration) => {
    setRequest({
      title: 'Test this connection',
      target: `${provider.provider} · ${provider.category}`,
      description: 'Sends a real request to the provider using the stored credential and records the answer. The credential itself is never shown.',
      confirmLabel: 'Run test',
      requiresReason: true,
      reasonLabel: 'Reason for the test',
      onConfirm: ({ reason }) => {
        const now = new Date().toISOString()
        setProviders((current) => current.map((item) => item.id === provider.id
          ? { ...item, lastCheckedAt: now, status: item.category === 'Analytics' ? 'Disconnected' : 'Connected' }
          : item))
        record({
          action: 'Tested an integration connection',
          target: `${provider.provider} · ${provider.category}`,
          reason,
          before: provider.status,
          after: provider.category === 'Analytics' ? 'Disconnected' : 'Connected',
          result: provider.category === 'Analytics' ? 'Failed' : 'Completed',
        })
        setVerified([
          { label: 'Provider', value: `${provider.provider} · ${provider.category}` },
          { label: 'Test run', value: stamp(now) },
          { label: 'Answer', value: provider.category === 'Analytics' ? 'No credential configured — test could not run' : 'Credential accepted, provider answered', ok: provider.category !== 'Analytics' },
          { label: 'Credential value', value: 'Never displayed', ok: true },
        ])
        setProviderId(null)
        onNotify(provider.category === 'Analytics' ? 'No credential is configured for this provider.' : `Connection to ${provider.provider} works.`)
      },
    })
  }

  const rotateCredential = (provider: Integration) => {
    setRequest({
      title: 'Rotate this credential',
      target: `${provider.provider} · ${provider.credentialLabel}`,
      description: 'The old credential keeps working until the new one is confirmed, so live traffic is not interrupted. Both operators are recorded.',
      confirmLabel: 'Rotate credential',
      requiresReason: true,
      requiresApproval: true,
      reasonLabel: 'Why is the credential being rotated?',
      options: [{ key: 'verify', label: 'Run a connection test immediately after rotating', defaultChecked: true }],
      onConfirm: ({ reason, approver, options }) => {
        const suffix = Math.random().toString(16).slice(2, 6)
        const label = provider.credentialLabel.replace(/ends \w+/, `ends ${suffix}`)
        setProviders((current) => current.map((item) => item.id === provider.id
          ? { ...item, credentialStatus: 'Active', credentialLabel: label, lastCheckedAt: new Date().toISOString() }
          : item))
        record({
          action: 'Rotated an integration credential',
          target: `${provider.provider} · ${provider.credentialLabel}`,
          reason,
          approver: approver || undefined,
          before: `${provider.credentialStatus} · ${provider.credentialLabel}`,
          after: `Active · ${label}`,
          result: 'Applied',
          options: options.verify ? ['Tested after rotation'] : [],
        })
        setVerified([
          { label: 'Provider', value: provider.provider },
          { label: 'Credential', value: `${provider.credentialLabel} → ${label}` },
          { label: 'Old credential', value: 'Retired after the new one was confirmed' },
          { label: 'Connection test', value: options.verify ? 'Passed' : 'Not run', ok: options.verify },
          { label: 'Secret value shown', value: 'Never', ok: true },
        ])
        setProviderId(null)
        onNotify(`${provider.provider} credential rotated.`)
      },
    })
  }

  const toggleProvider = (provider: Integration) => {
    const connecting = provider.status === 'Disconnected'
    setRequest({
      title: connecting ? 'Reconnect this provider' : 'Disconnect this provider',
      target: `${provider.provider} · ${provider.category}`,
      description: connecting
        ? 'The stored credential is used again. Anything that was queued while the provider was disconnected is sent.'
        : 'The provider stops receiving traffic. Anything queued is held until the provider is connected again.',
      confirmLabel: connecting ? 'Reconnect' : 'Disconnect',
      danger: !connecting,
      requiresReason: true,
      requiresApproval: !connecting,
      onConfirm: ({ reason, approver }) => {
        setProviders((current) => current.map((item) => item.id === provider.id ? { ...item, status: connecting ? 'Connected' : 'Disconnected' } : item))
        record({
          action: connecting ? 'Reconnected an integration' : 'Disconnected an integration',
          target: `${provider.provider} · ${provider.category}`,
          reason,
          approver: approver || undefined,
          before: provider.status,
          after: connecting ? 'Connected' : 'Disconnected',
          result: 'Applied',
        })
        setVerified([
          { label: 'Provider', value: provider.provider },
          { label: 'Status', value: `${provider.status} → ${connecting ? 'Connected' : 'Disconnected'}` },
          { label: 'Queued events', value: connecting ? 'Will be sent on the next run' : 'Held, not lost' },
        ])
        setProviderId(null)
        onNotify(`${provider.provider} ${connecting ? 'reconnected' : 'disconnected'}.`)
      },
    })
  }

  const toggleEndpoint = (endpoint: WebhookEndpoint) => {
    const resuming = endpoint.status !== 'Healthy'
    setRequest({
      title: resuming ? 'Resume this endpoint' : 'Pause this endpoint',
      target: `${endpoint.provider} · ${endpoint.path}`,
      description: resuming
        ? 'Deliveries resume from the queue. Anything that failed is retried in order.'
        : 'The provider keeps sending, but events are held in the queue instead of calling this endpoint while it fails.',
      confirmLabel: resuming ? 'Resume deliveries' : 'Pause deliveries',
      requiresReason: true,
      onConfirm: ({ reason }) => {
        setEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, status: resuming ? 'Healthy' : 'Paused', failureRate: resuming ? 0 : item.failureRate } : item))
        record({
          action: resuming ? 'Resumed a webhook endpoint' : 'Paused a webhook endpoint',
          target: `${endpoint.provider} · ${endpoint.path}`,
          reason,
          before: endpoint.status,
          after: resuming ? 'Healthy' : 'Paused',
          result: 'Applied',
        })
        setVerified([
          { label: 'Endpoint', value: endpoint.path },
          { label: 'Status', value: `${endpoint.status} → ${resuming ? 'Healthy' : 'Paused'}` },
          { label: 'Failure rate', value: resuming ? '0% since the last delivery' : `${endpoint.failureRate}% before pausing` },
          { label: 'Queued events', value: `${deliveries.filter((delivery) => delivery.endpointId === endpoint.id && delivery.outcome !== 'Delivered').length}` },
        ])
        setEndpointId(null)
        onNotify(`${endpoint.provider} endpoint ${resuming ? 'resumed' : 'paused'}.`)
      },
    })
  }

  const retryDelivery = (delivery: WebhookDelivery) => {
    setRequest({
      title: 'Retry this delivery',
      target: `${delivery.event} · ${delivery.id}`,
      description: 'The event is sent again with its original payload. The attempt count is kept so a provider that keeps failing stays visible.',
      confirmLabel: 'Retry now',
      requiresReason: true,
      onConfirm: ({ reason }) => {
        const now = new Date().toISOString()
        setDeliveries((current) => current.map((item) => item.id === delivery.id
          ? { ...item, outcome: 'Delivered', statusCode: 200, attempts: item.attempts + 1, at: now, error: null }
          : item))
        setEndpoints((current) => current.map((item) => item.id === delivery.endpointId ? { ...item, status: 'Healthy', failureRate: 0, lastDeliveryAt: now } : item))
        record({
          action: 'Retried a failed webhook delivery',
          target: `${delivery.event} · ${delivery.id}`,
          reason,
          before: `Failed · ${delivery.attempts} attempt${delivery.attempts === 1 ? '' : 's'} · HTTP ${delivery.statusCode}`,
          after: `Delivered · ${delivery.attempts + 1} attempts · HTTP 200`,
          result: 'Applied',
        })
        setVerified([
          { label: 'Delivery', value: `${delivery.id} · ${delivery.event}` },
          { label: 'Previous error', value: delivery.error ?? 'None recorded' },
          { label: 'Now', value: 'HTTP 200 · delivered' },
          { label: 'Endpoint', value: endpoints.find((endpoint) => endpoint.id === delivery.endpointId)?.path ?? 'Unknown' },
        ])
        setDeliveryId(null)
        onNotify(`${delivery.id} delivered on retry.`)
      },
    })
  }

  const retryAllFailed = (endpoint: WebhookEndpoint) => {
    const targets = deliveries.filter((delivery) => delivery.endpointId === endpoint.id && delivery.outcome !== 'Delivered')
    setRequest({
      title: 'Retry every failed delivery',
      target: `${endpoint.provider} · ${targets.length} event${targets.length === 1 ? '' : 's'}`,
      description: 'Queued and failed events for this endpoint are sent again in the order they were received.',
      confirmLabel: `Retry ${targets.length}`,
      requiresReason: true,
      onConfirm: ({ reason }) => {
        const ids = targets.map((delivery) => delivery.id)
        setDeliveries((current) => current.map((item) => ids.includes(item.id) ? { ...item, outcome: 'Delivered', statusCode: 200, attempts: item.attempts + 1, error: null } : item))
        setEndpoints((current) => current.map((item) => item.id === endpoint.id ? { ...item, status: 'Healthy', failureRate: 0 } : item))
        record({
          action: 'Retried every failed webhook delivery',
          target: `${endpoint.provider} · ${endpoint.path}`,
          reason,
          before: `${targets.length} failed or queued`,
          after: 'Delivered',
          result: 'Applied',
        })
        setVerified([
          { label: 'Endpoint', value: endpoint.path },
          { label: 'Events retried', value: `${targets.length}` },
          { label: 'Endpoint status', value: 'Healthy' },
          { label: 'Failure rate', value: '0%' },
        ])
        setEndpointId(null)
        onNotify(`${targets.length} deliveries retried.`)
      },
    })
  }

  const exportIntegrations = () => {
    downloadCsv('platform-integrations.csv', [
      ['Provider', 'Category', 'Status', 'Credential', 'Credential label', 'Last checked', 'Note'],
      ...providers.map((provider) => [provider.provider, provider.category, provider.status, provider.credentialStatus, provider.credentialLabel, provider.lastCheckedAt, provider.note]),
      [],
      ['Endpoint', 'Provider', 'Path', 'Events', 'Status', 'Failure rate %', 'Last delivery'],
      ...endpoints.map((endpoint) => [endpoint.id, endpoint.provider, endpoint.path, endpoint.events.join(' / '), endpoint.status, endpoint.failureRate, endpoint.lastDeliveryAt]),
      [],
      ['Delivery', 'Event', 'Time', 'HTTP', 'Attempts', 'Outcome', 'Error'],
      ...deliveries.map((delivery) => [delivery.id, delivery.event, delivery.at, delivery.statusCode, delivery.attempts, delivery.outcome, delivery.error ?? '']),
    ])
    onNotify('Integrations report exported.')
  }

  const providerColumns: Array<Column<Integration>> = [
    { key: 'provider', label: 'Provider', width: 'minmax(0,1.4fr)', render: (provider) => <span><span className="block font-semibold">{provider.provider}</span><span className="block text-xs text-graphite">{provider.category}</span></span> },
    { key: 'status', label: 'Connection', render: (provider) => <Pill label={provider.status} /> },
    { key: 'credential', label: 'Credential', render: (provider) => <span className="text-xs text-graphite"><Pill label={provider.credentialStatus} /><span className="mt-1 block">{provider.credentialLabel}</span></span> },
    { key: 'checked', label: 'Last checked', render: (provider) => <span className="text-xs text-graphite">{timeAgo(provider.lastCheckedAt)}</span> },
    { key: 'note', label: 'Note', width: 'minmax(0,1.4fr)', render: (provider) => <span className="text-xs text-graphite">{provider.note}</span> },
  ]

  const endpointColumns: Array<Column<WebhookEndpoint>> = [
    { key: 'provider', label: 'Endpoint', width: 'minmax(0,1.4fr)', render: (endpoint) => <span><span className="block font-semibold">{endpoint.provider}</span><span className="block text-xs text-graphite">{endpoint.path}</span></span> },
    { key: 'events', label: 'Events', width: 'minmax(0,1.3fr)', render: (endpoint) => <span className="text-xs text-graphite">{endpoint.events.join(', ')}</span> },
    { key: 'status', label: 'Status', render: (endpoint) => <Pill label={endpoint.status} /> },
    { key: 'failure', label: 'Failure rate', render: (endpoint) => <span className={endpoint.failureRate > 10 ? 'font-semibold text-red-600 dark:text-red-300' : ''}>{endpoint.failureRate}%</span> },
    { key: 'last', label: 'Last delivery', render: (endpoint) => <span className="text-xs text-graphite">{timeAgo(endpoint.lastDeliveryAt)}</span> },
  ]

  const deliveryColumns: Array<Column<WebhookDelivery>> = [
    { key: 'event', label: 'Event', width: 'minmax(0,1.2fr)', render: (delivery) => <span><span className="block font-semibold">{delivery.event}</span><span className="block text-xs text-graphite">{delivery.id} · {endpoints.find((endpoint) => endpoint.id === delivery.endpointId)?.provider ?? 'Unknown provider'}</span></span> },
    { key: 'outcome', label: 'Outcome', render: (delivery) => <Pill label={delivery.outcome} /> },
    { key: 'http', label: 'HTTP', render: (delivery) => <span className="text-sm">{delivery.statusCode || '—'}</span> },
    { key: 'attempts', label: 'Attempts', render: (delivery) => <span className="text-sm">{delivery.attempts}</span> },
    { key: 'error', label: 'Error', width: 'minmax(0,1.4fr)', render: (delivery) => <span className="text-xs text-graphite">{delivery.error ?? 'None'}</span> },
    { key: 'when', label: 'When', render: (delivery) => <span className="text-xs text-graphite">{timeAgo(delivery.at)}</span> },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="External services"
        title="Integrations"
        description="Which providers are connected, whether their credentials still work, and what happened to the events they sent."
        action={<ExportButton onClick={exportIntegrations} label="Export report" />}
      />
      <PrototypeNotice
        scope="Integrations"
        detail="No integration, API key or webhook is recorded in the database — email and payment credentials live in Supabase configuration, not in a table this screen can manage. Provider states, credential labels and delivery attempts here are sample data. Secret values are never shown, and the screens only ever show a label."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Providers connected" value={providers.filter((provider) => provider.status === 'Connected').length.toString()} detail={`Of ${providers.length} configured providers`} icon={PlugsConnected} tone="success" />
        <KpiTile label="Providers needing attention" value={providers.filter((provider) => provider.status !== 'Connected').length.toString()} detail={providers.filter((provider) => provider.status !== 'Connected').map((provider) => provider.provider).join(', ') || 'Every provider is healthy'} icon={Warning} tone={providers.some((provider) => provider.status !== 'Connected') ? 'warning' : 'success'} />
        <KpiTile label="Failing webhook endpoints" value={failingEndpoints.length.toString()} detail={failingEndpoints.map((endpoint) => endpoint.provider).join(', ') || 'Every endpoint is healthy'} icon={Activity} tone={failingEndpoints.length ? 'danger' : 'success'} />
        <KpiTile label="Failed deliveries" value={failedDeliveries.length.toString()} detail={`${deliveries.length} attempts recorded on this screen`} icon={RefreshCw} tone={failedDeliveries.length ? 'danger' : 'success'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Providers" description="Open a provider to test it, rotate its credential or disconnect it." action={<SampleTag />}>
          <DataTable columns={providerColumns} rows={providers} rowKey={(provider) => provider.id} onRow={(provider) => setProviderId(provider.id)} />
        </Panel>

        <Panel title="Credential hygiene" description="What the platform can tell you without showing a secret." action={<SampleTag />}>
          <ul className="space-y-3">
            {providers.map((provider) => (
              <li key={provider.id} className="border-b border-ink/[0.06] pb-3 last:border-0 last:pb-0 dark:border-white/[0.08]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold">{provider.provider}</span>
                  <Pill label={provider.credentialStatus} />
                  <span className="font-mono text-[11px] text-graphite">{provider.credentialLabel}</span>
                </div>
                <p className="mt-1 text-xs text-graphite">
                  {provider.credentialStatus === 'Missing' && 'No credential is stored, so this provider cannot be called.'}
                  {provider.credentialStatus === 'Expiring soon' && `Rotate before ${provider.provider} rejects the credential.`}
                  {provider.credentialStatus === 'Active' && `Checked ${timeAgo(provider.lastCheckedAt)}.`}
                </p>
              </li>
            ))}
          </ul>
          <Callout tone="info" title="Secrets never reach this screen">
            The platform stores credentials outside the application database. This screen shows a label, a status and a check time — never a key, a token or a
            password, and there is no control that could reveal one.
          </Callout>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Webhook endpoints" description="Where provider events are delivered, and how healthy those deliveries are." action={<SampleTag />}>
          <DataTable columns={endpointColumns} rows={endpoints} rowKey={(endpoint) => endpoint.id} onRow={(endpoint) => setEndpointId(endpoint.id)} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Recent deliveries" description="Open a delivery to read the error and retry it." action={<SampleTag />}>
          <DataTable columns={deliveryColumns} rows={deliveries} rowKey={(delivery) => delivery.id} onRow={(delivery) => setDeliveryId(delivery.id)} emptyLabel="No delivery attempts recorded." />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <ActionLogPanel entries={entries} description="Connection tests, credential rotations, endpoint changes and retries from this session." />
        {verified
          ? <VerificationPanel title="Result of the last action" checks={verified} note="A real rotation is confirmed by the provider answering a request with the new credential." />
          : <Panel title="Verify the result" description="Every action on this screen reports what changed."><p className="text-sm text-graphite">Test a connection, rotate a credential or retry a delivery to see the confirmation here.</p></Panel>}
      </div>

      <DetailModal
        open={Boolean(selectedProvider)}
        onClose={() => setProviderId(null)}
        title={selectedProvider?.provider ?? ''}
        description={selectedProvider ? `${selectedProvider.category} · credential ${selectedProvider.credentialStatus}` : ''}
        summary={selectedProvider && (
          <Callout tone={selectedProvider.status === 'Connected' ? 'success' : selectedProvider.status === 'Degraded' ? 'warning' : 'danger'} title={`Connection: ${selectedProvider.status}`}>
            {selectedProvider.note}
          </Callout>
        )}
        meta={selectedProvider ? [
          ['Category', selectedProvider.category],
          ['Status', <Pill key="status" label={selectedProvider.status} />],
          ['Credential status', <Pill key="credential" label={selectedProvider.credentialStatus} />],
          ['Credential label', selectedProvider.credentialLabel],
          ['Last checked', `${timeAgo(selectedProvider.lastCheckedAt)} · ${stamp(selectedProvider.lastCheckedAt)}`],
        ] : []}
        footer={selectedProvider && (
          <>
            <Button variant="outline" size="sm" onClick={() => testConnection(selectedProvider)}><RefreshCw className="h-4 w-4" /> Test connection</Button>
            <Button variant="outline" size="sm" onClick={() => rotateCredential(selectedProvider)}><KeyRound className="h-4 w-4" /> Rotate credential</Button>
            <Button variant={selectedProvider.status === 'Disconnected' ? 'accent' : 'danger'} size="sm" onClick={() => toggleProvider(selectedProvider)}>
              {selectedProvider.status === 'Disconnected' ? <><Check className="h-4 w-4" /> Reconnect</> : <><Warning className="h-4 w-4" /> Disconnect</>}
            </Button>
          </>
        )}
        size="lg"
      >
        {selectedProvider && (
          <MetaList
            columns={1}
            items={[
              ['Rotation is safe by design', 'The old credential stays valid until the new one is confirmed by a successful request, so rotating does not interrupt live traffic.'],
              ['What is not shown', 'The key, token or secret step is performed by the server. This screen never receives the value.'],
              ['Where the credential lives', 'In Supabase configuration, which is why there is no credential table and no row an operator could read.'],
            ]}
          />
        )}
      </DetailModal>

      <DetailModal
        open={Boolean(selectedEndpoint)}
        onClose={() => setEndpointId(null)}
        title={selectedEndpoint?.provider ?? ''}
        description={selectedEndpoint ? `${selectedEndpoint.path} · ${selectedEndpoint.status}` : ''}
        summary={selectedEndpoint && (
          <Callout tone={selectedEndpoint.status === 'Healthy' ? 'success' : selectedEndpoint.status === 'Failing' ? 'danger' : 'warning'} title={`Deliveries: ${selectedEndpoint.status}`}>
            {selectedEndpoint.failureRate}% of recent deliveries to this endpoint did not succeed.
          </Callout>
        )}
        meta={selectedEndpoint ? [
          ['Path', selectedEndpoint.path],
          ['Events', selectedEndpoint.events.join(', ')],
          ['Status', <Pill key="status" label={selectedEndpoint.status} />],
          ['Failure rate', `${selectedEndpoint.failureRate}%`],
          ['Last delivery', `${timeAgo(selectedEndpoint.lastDeliveryAt)} · ${stamp(selectedEndpoint.lastDeliveryAt)}`],
          ['Failed or queued events', deliveries.filter((delivery) => delivery.endpointId === selectedEndpoint.id && delivery.outcome !== 'Delivered').length.toString()],
        ] : []}
        footer={selectedEndpoint && (
          <>
            <Button variant="outline" size="sm" onClick={() => toggleEndpoint(selectedEndpoint)}>{selectedEndpoint.status === 'Healthy' ? 'Pause deliveries' : 'Resume deliveries'}</Button>
            <Button variant="accent" size="sm" onClick={() => retryAllFailed(selectedEndpoint)}><RefreshCw className="h-4 w-4" /> Retry failed events</Button>
          </>
        )}
        size="lg"
      >
        {selectedEndpoint && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Recent deliveries to this endpoint</p>
            <ul className="space-y-2">
              {deliveries.filter((delivery) => delivery.endpointId === selectedEndpoint.id).map((delivery) => (
                <li key={delivery.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.035] p-3 text-sm dark:bg-white/[0.05]">
                  <Pill label={delivery.outcome} />
                  <span className="min-w-0 flex-1 text-xs text-graphite">{delivery.event} · HTTP {delivery.statusCode || '—'} · {delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'}</span>
                  <button onClick={() => { setEndpointId(null); setDeliveryId(delivery.id) }} className="text-xs font-semibold text-brand">Open</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DetailModal>

      <DetailModal
        open={Boolean(selectedDelivery)}
        onClose={() => setDeliveryId(null)}
        title={selectedDelivery?.event ?? ''}
        description={selectedDelivery ? `${selectedDelivery.id} · HTTP ${selectedDelivery.statusCode || '—'} · ${selectedDelivery.attempts} attempt${selectedDelivery.attempts === 1 ? '' : 's'}` : ''}
        summary={selectedDelivery && (
          <Callout tone={selectedDelivery.outcome === 'Delivered' ? 'success' : 'danger'} title={selectedDelivery.error ?? 'Delivered without an error'}>
            {selectedDelivery.outcome === 'Delivered' ? 'The provider accepted this event.' : 'The event did not reach the endpoint. The payload is kept so it can be sent again.'}
          </Callout>
        )}
        meta={selectedDelivery ? [
          ['Outcome', <Pill key="outcome" label={selectedDelivery.outcome} />],
          ['Endpoint', endpoints.find((endpoint) => endpoint.id === selectedDelivery.endpointId)?.path ?? 'Unknown'],
          ['Received', `${timeAgo(selectedDelivery.at)} · ${stamp(selectedDelivery.at)}`],
          ['Attempts', selectedDelivery.attempts.toString()],
        ] : []}
        footer={selectedDelivery && selectedDelivery.outcome !== 'Delivered' && (
          <Button variant="accent" size="sm" onClick={() => retryDelivery(selectedDelivery)}><RefreshCw className="h-4 w-4" /> Retry this delivery</Button>
        )}
        size="md"
      >
        {selectedDelivery && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite">Payload (sample)</p>
            <pre className="overflow-x-auto rounded-xl bg-ink/[0.05] p-3 text-xs dark:bg-white/[0.06]">{selectedDelivery.payload}</pre>
            <p className="mt-2 text-xs text-graphite">Payloads are stored for a limited window so a failure can be investigated and replayed. Secrets and full card numbers are never part of a payload.</p>
          </div>
        )}
      </DetailModal>

      <ActionDialog request={request} onClose={() => setRequest(null)} actor={operator} />
    </>
  )
}
