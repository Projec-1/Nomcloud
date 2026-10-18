import { CreditCard, FileText, Receipt } from '@phosphor-icons/react'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

export default function BillingSection() {
  return <>
    <SectionHeader eyebrow="Commercial operations" title="Billing" description="Network-wide plans, invoices, payments, and exceptions." />
    <UnavailableNotice scope="Platform billing operations" detail="No platform-wide invoice, payment, or reconciliation source is connected. This screen does not display estimated balances, payment results, or subscription outcomes." />
    <div className="grid gap-4 md:grid-cols-3"><KpiTile label="Plans" value="Not available" detail="No platform plan registry is connected" icon={CreditCard} tone="warning" /><KpiTile label="Invoices" value="Not available" detail="No invoice source exists" icon={FileText} tone="warning" /><KpiTile label="Payments" value="Not available" detail="No payment-event source exists" icon={Receipt} tone="warning" /></div>
    <Panel title="What is needed" description="Billing becomes available only after its records can be verified."><p className="text-sm text-graphite">A payment-provider integration needs verified provider events and a reconciliation record before it can show a payment status or change a subscription.</p></Panel>
  </>
}
