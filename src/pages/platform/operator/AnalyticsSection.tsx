import { ChartLine, CurrencyDollar, Users } from '@phosphor-icons/react'
import { Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function AnalyticsSection() {
  return <>
    <SectionHeader eyebrow="Network reporting" title="Analytics" description="Trends and performance measures for the whole platform." />
    <UnavailableNotice scope="Platform analytics" detail="The product has no reporting view or aggregate metrics source for retention, revenue, regional breakdowns, or product usage. This screen does not estimate those figures." />
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title="Growth and usage" description="Schools, people, and adoption over time."><p className="text-sm text-graphite">No trend source is connected.</p></Panel>
      <Panel title="Commercial reporting" description="Plans, invoices, and collections."><p className="text-sm text-graphite">No platform billing ledger is connected.</p></Panel>
      <Panel title="Lifecycle metrics" description="Activation, retention, and churn."><p className="text-sm text-graphite">No lifecycle metrics are recorded.</p></Panel>
    </div>
    <Panel title="Required sources" description="These must exist before analytics can present operational numbers." className="mt-6"><ul className="grid gap-3 text-sm text-graphite sm:grid-cols-3"><li className="flex gap-2"><ChartLine className="mt-0.5 h-4 w-4 shrink-0 text-brand" />A versioned reporting view</li><li className="flex gap-2"><CurrencyDollar className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Verified billing events</li><li className="flex gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Defined lifecycle measures</li></ul></Panel>
  </>
}
