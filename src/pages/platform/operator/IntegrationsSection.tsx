import { Key, PlugsConnected, Warning } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function IntegrationsSection() {
  return <>
    <SectionHeader eyebrow="External services" title="Integrations" description="Connected providers, credentials, webhooks, and delivery outcomes." />
    <UnavailableNotice scope="Integration management" detail="No integration registry, webhook endpoint source, credential-health source, or delivery log is connected. Provider configuration stays outside the browser client." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Connected providers" value="Not available" detail="No integration registry" icon={PlugsConnected} tone="warning" /><KpiTile label="Credential health" value="Not available" detail="No safe credential status source" icon={Key} tone="warning" /><KpiTile label="Webhook delivery" value="Not available" detail="No delivery log" icon={Warning} tone="warning" /></div>
    <Panel title="Credential safety" description="How provider access should be handled."><p className="text-sm text-graphite">Credentials belong in secured server configuration. This workspace should only receive non-secret, verified status and delivery records after that integration exists.</p></Panel>
  </>
}
