import { Users, CalendarCheck, BookOpen, ClipboardText as ClipboardCheck, Wallet, Bell, ChatText as MessageSquare, BellRinging as BellRing, ChartBar as BarChart3, CalendarBlank as CalendarRange, SlidersHorizontal } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import AdministratorWorkspacePreview from '@/components/marketing/previews/AdministratorWorkspacePreview'
import TeacherDashboardMock from '@/components/marketing/previews/TeacherDashboardMock'
import ParentAppMock from '@/components/marketing/previews/ParentAppMock'
import FeatureMock, { type FeatureMockVariant } from '@/components/marketing/previews/FeatureMock'
import TiltCard from '@/components/marketing/TiltCard'
import { useLanguage } from '@/context/LanguageContext'

const featureGrid: { icon: typeof Users; n: number; variant: FeatureMockVariant; tint: string }[] = [
  { icon: Users, n: 1, variant: 'table', tint: '#0071E3' },
  { icon: CalendarCheck, n: 2, variant: 'table', tint: '#34A853' },
  { icon: BookOpen, n: 3, variant: 'chart', tint: '#FF5A1F' },
  { icon: ClipboardCheck, n: 4, variant: 'list', tint: '#A855F7' },
  { icon: BarChart3, n: 5, variant: 'calendar', tint: '#EC4899' },
  { icon: Wallet, n: 6, variant: 'table', tint: '#F59E0B' },
  { icon: Bell, n: 7, variant: 'list', tint: '#0071E3' },
  { icon: MessageSquare, n: 8, variant: 'chat', tint: '#14B8A6' },
  { icon: BellRing, n: 9, variant: 'list', tint: '#FF5A1F' },
  { icon: BarChart3, n: 10, variant: 'chart', tint: '#6366F1' },
  { icon: CalendarRange, n: 11, variant: 'cards', tint: '#34A853' },
  { icon: SlidersHorizontal, n: 12, variant: 'cards', tint: '#6E6E73' },
]

export default function Features() {
  const { t } = useLanguage()
  return (
    <div>
      <SEO
        title="Features — Every Tool Your School Needs"
        description="Student management, attendance, grades, homework, exams, fees, announcements, messaging and reports — all in one platform."
        path="/features"
      />
      <section className="pt-20 pb-16 sm:pt-28">
        <div className="container text-center">
          <Reveal>
            <span className="eyebrow">{t('features.eyebrow')}</span>
            <h1 className="mx-auto mt-6 max-w-3xl text-display-lg text-ink dark:text-white">{t('features.title')}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-graphite">{t('features.subtitle')}</p>
          </Reveal>
        </div>
      </section>

      <section className="pb-8">
        <div className="container space-y-16">
          <Reveal>
            <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-graphite">{t('features.adminLabel')}</p>
            <AdministratorWorkspacePreview interactive />
          </Reveal>
          <div className="grid gap-8 lg:grid-cols-2">
            <Reveal>
              <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-graphite">{t('features.teacherLabel')}</p>
              <TeacherDashboardMock />
            </Reveal>
            <Reveal delay={120} className="flex flex-col items-center">
              <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-graphite">{t('features.parentLabel')}</p>
              <ParentAppMock />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-display-md text-ink dark:text-white">{t('features.connected.title')}</h2>
            <p className="mt-4 text-base text-graphite">{t('features.connected.subtitle')}</p>
          </Reveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featureGrid.map((f, i) => (
              <Reveal key={f.n} delay={(i % 3) * 100}>
                <TiltCard max={4}>
                  <div className="card h-full p-6 transition-transform duration-300 hover:-translate-y-1">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="rounded-xl p-2.5" style={{ backgroundColor: `${f.tint}1A`, color: f.tint }}>
                        <f.icon className="h-[18px] w-[18px]" />
                      </div>
                      <h3 className="font-semibold text-ink dark:text-white">{t(`features.item${f.n}.title`)}</h3>
                    </div>
                    <p className="mb-5 text-sm leading-relaxed text-graphite">{t(`features.item${f.n}.body`)}</p>
                    <div className="rounded-xl bg-mist p-3 dark:bg-white/5">
                      <FeatureMock variant={f.variant} tint={f.tint} />
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
