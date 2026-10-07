import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import { useLanguage } from '@/context/LanguageContext'

const sections = [
  {
    title: '1. What we collect',
    body: 'When a school uses Nom Cloud, we process the information the school provides to run its operations: student records (name, class, guardian contact), attendance, grades, homework, fee and payment records, and messages sent through the platform. Administrators, teachers and parents also provide account details (name, email, phone) to sign in.',
  },
  {
    title: '2. How we use it',
    body: 'Data is used solely to operate the platform for the school that owns it — displaying dashboards, sending notifications, generating reports, and processing fee payments the school or a parent initiates. We do not use school data to train external models or for advertising of any kind.',
  },
  {
    title: '3. Who can access it',
    body: 'Access is role-based: administrators see school-wide data, teachers see their assigned classes, and parents see only their own children\'s records. Nom Cloud staff access data only to provide support a school has requested, or where required by law.',
  },
  {
    title: '4. Data storage & security',
    body: 'Each school\'s data is isolated from every other school\'s. Data in transit is encrypted. See our Security page for a full breakdown of how we protect school data.',
  },
  {
    title: '5. Payment information',
    body: 'Card, mobile money and bank transfer details are handled by the relevant payment provider\'s secure systems. Nom Cloud stores only the outcome of a transaction (amount, date, method, status) — never full card or account numbers.',
  },
  {
    title: '6. Your rights',
    body: 'Schools may request a full export or permanent deletion of their data at any time. Parents and staff may request correction of inaccurate personal details through their school administrator.',
  },
  {
    title: '7. Changes to this policy',
    body: 'We\'ll post any material changes to this page with an updated effective date, and notify school administrators directly for significant changes.',
  },
]

export default function Privacy() {
  const { t } = useLanguage()
  return (
    <div>
      <SEO title="Privacy Policy" description="How Nom Cloud collects, uses and protects school, staff and family data." path="/privacy" />
      <section className="pt-20 pb-12 sm:pt-28">
        <div className="container max-w-3xl text-center">
          <Reveal>
            <span className="eyebrow">{t('legal.badge')}</span>
            <h1 className="mx-auto mt-6 text-display-lg text-ink dark:text-white">{t('legal.privacy.title')}</h1>
            <p className="mx-auto mt-6 text-base text-graphite">{t('legal.effective')}</p>
          </Reveal>
        </div>
      </section>
      <section className="pb-24">
        <div className="container max-w-3xl">
          <div role="note" className="mb-5 border-l-2 border-amber-500 bg-amber-500/[0.06] px-4 py-3">
            <p className="text-sm font-semibold text-ink dark:text-white">Children’s privacy details require final review</p>
            <p className="mt-1 text-sm text-graphite">
              Placeholder: Nom Cloud must publish school-approved, jurisdiction-specific details about children’s data,
              applicable consent, retention, and data-protection responsibilities before this policy is treated as final.
              This notice is not legal advice or a claim of compliance.
            </p>
          </div>
          <Reveal className="card space-y-8 p-8 sm:p-12">
            {sections.map((s) => (
              <div key={s.title}>
                <h2 className="text-lg font-semibold text-ink dark:text-white">{s.title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-graphite">{s.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </div>
  )
}
