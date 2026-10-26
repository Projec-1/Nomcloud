import { Lock, ShieldCheck, HardDrive as ServerCog, Key as KeyRound, Eye, FileText as FileCheck2, Prohibit as ProhibitIcon, IdentificationCard as IdCard, Users, ClipboardText as ClipboardList, Wallet, ChatText as MessageSquare, MapPin } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import FaqAccordion from '@/components/marketing/FaqAccordion'
import { useLanguage } from '@/context/LanguageContext'
import { img } from '@/data/images'

const pillars = [
  { icon: Lock, titleKey: 'security.pillar1.title', bodyKey: 'security.pillar1.body' },
  { icon: KeyRound, titleKey: 'security.pillar2.title', bodyKey: 'security.pillar2.body' },
  { icon: ServerCog, titleKey: 'security.pillar3.title', bodyKey: 'security.pillar3.body' },
  { icon: Eye, titleKey: 'security.pillar4.title', bodyKey: 'security.pillar4.body' },
]

const dataTypes = [
  { icon: IdCard, key: 'security.data.item1' },
  { icon: MapPin, key: 'security.data.item2' },
  { icon: ClipboardList, key: 'security.data.item3' },
  { icon: Users, key: 'security.data.item4' },
  { icon: Wallet, key: 'security.data.item5' },
  { icon: MessageSquare, key: 'security.data.item6' },
]

const alwaysItems = ['security.always.item1', 'security.always.item2', 'security.always.item3', 'security.always.item4', 'security.always.item5']
const neverItems = ['security.never.item1', 'security.never.item2', 'security.never.item3', 'security.never.item4', 'security.never.item5']
const faqKeys = ['1', '2', '3', '4', '5', '6', '7']

export default function Security() {
  const { t } = useLanguage()
  const faqs = faqKeys.map((n) => ({ q: t(`security.faq.q${n}`), a: t(`security.faq.a${n}`) }))

  return (
    <div>
      <SEO
        title="Security & Privacy"
        description="How Nom Cloud protects student and school data — private by default, encrypted, and never sold or shared."
        path="/security"
      />
      <section className="pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div className="container text-center">
          <Reveal>
            <h1 className="mx-auto max-w-3xl text-display-lg text-ink dark:text-white">{t('security.title')}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-graphite">{t('security.subtitle')}</p>
          </Reveal>
        </div>
      </section>

      <section className="pb-24">
        <div className="container">
          <Reveal>
            <div className="grid overflow-hidden rounded-xl border border-ink/10 bg-white dark:border-white/10 dark:bg-[#202320] lg:grid-cols-2">
              <div className="relative flex min-h-[18rem] flex-col justify-end overflow-hidden p-10 sm:p-14">
                <img src="/security-classroom.png" alt="Student raising her hand in a classroom" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-ink/65" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-xl bg-white/10">
                  <Lock className="h-8 w-8 text-white" />
                </div>
                <h2 className="relative mt-6 text-2xl font-semibold text-white sm:text-display-md">{t('security.isolated.title')}</h2>
              </div>
              <div className="flex items-center bg-white p-6 dark:bg-[#202320] sm:p-10">
                <p className="text-base leading-relaxed text-graphite">{t('security.isolated.body')}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section bg-white dark:bg-white/[0.02]">
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-display-md text-ink dark:text-white">{t('security.protect.title')}</h2>
            <p className="mt-4 text-base leading-relaxed text-graphite">{t('security.protect.intro')}</p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dataTypes.map((d, i) => (
              <Reveal key={d.key} delay={i * 60} className="flex items-center gap-3 rounded-2xl border border-ink/5 bg-mist px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <d.icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-ink dark:text-white">{t(d.key)}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {pillars.map((p, i) => (
              <Reveal key={p.titleKey} delay={i * 100}>
                <article className="h-full rounded-xl border border-ink/10 bg-white p-6 dark:border-white/10 dark:bg-[#202320] sm:p-8">
                  <div className="inline-flex rounded-xl bg-brand/10 p-3 text-brand">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-ink dark:text-white">{t(p.titleKey)}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-graphite">{t(p.bodyKey)}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section overflow-hidden">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">
              <FileCheck2 className="h-3.5 w-3.5" /> {t('security.practices.eyebrow')}
            </span>
            <h2 className="mt-5 text-display-md text-ink dark:text-white">{t('security.practices.title')}</h2>
          </Reveal>
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <Reveal className="overflow-hidden rounded-[1.75rem] border border-ink/5 bg-white shadow-soft dark:border-white/10 dark:bg-[#161618]">
              <div className="relative h-32 overflow-hidden">
                <img src={img('dataCorridor', 800)} alt="Secure data center corridor" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-emerald-600/40 mix-blend-multiply" />
              </div>
              <div className="p-8">
                <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <ShieldCheck className="h-4 w-4" /> {t('security.always.label')}
                </p>
                <ul className="space-y-3 text-sm text-ink dark:text-white">
                  {alwaysItems.map((k) => (
                    <li key={k} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={100} className="overflow-hidden rounded-[1.75rem] border border-ink/5 bg-white shadow-soft dark:border-white/10 dark:bg-[#161618]">
              <div className="relative h-32 overflow-hidden">
                <img src={img('serverCables', 800)} alt="Network infrastructure" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-red-600/40 mix-blend-multiply" />
              </div>
              <div className="p-8">
                <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-red-500">
                  <ProhibitIcon className="h-4 w-4" /> {t('security.never.label')}
                </p>
                <ul className="space-y-3 text-sm text-ink dark:text-white">
                  {neverItems.map((k) => (
                    <li key={k} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container max-w-3xl">
          <Reveal className="text-center">
            <span className="eyebrow">{t('security.faq.eyebrow')}</span>
            <h2 className="mt-5 text-display-md text-ink dark:text-white">{t('security.faq.title')}</h2>
          </Reveal>
          <div className="mt-12">
            <FaqAccordion items={faqs} />
          </div>
        </div>
      </section>
    </div>
  )
}
