import { Wrench } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'

// ---------------------------------------------------------------------------
type TemplateKind = 'email'

export default function AdminTemplates({ kind }: { kind: TemplateKind }) {
  const title = kind === 'email' ? 'Email templates' : 'Templates'
  return (
    <div>
      <PageHeader
        title={title}
        description="Reusable wording for the email messages your school sends."
      />
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink/[0.06] text-graphite dark:bg-white/[0.1]">
          <Wrench className="h-5 w-5" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-ink dark:text-white">Not available yet</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-graphite">
          Email templates are not stored anywhere yet, so anything written here could not be shared with your colleagues or used
          by Nom Cloud. This screen will open once email templates have a home in your school&rsquo;s records.
        </p>
      </div>
    </div>
  )
}
