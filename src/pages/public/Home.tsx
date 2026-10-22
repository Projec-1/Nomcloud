import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Lightning as Zap, Users, CalendarCheck, BookOpen, Wallet, Bell, ChatText as MessageSquare, ChartBar as BarChart3, ClipboardText as ClipboardCheck, GraduationCap, CalendarBlank as CalendarRange, Buildings, CheckCircle as CheckCircle2 } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import AdministratorWorkspacePreview from '@/components/marketing/previews/AdministratorWorkspacePreview'
import TeacherDashboardMock from '@/components/marketing/previews/TeacherDashboardMock'
import ParentAppMock from '@/components/marketing/previews/ParentAppMock'
import { useLanguage } from '@/context/LanguageContext'
import { img } from '@/data/images'

const pillars = [
  { icon: Users, titleKey: 'home.pillar1.title', bodyKey: 'home.pillar1.body', image: img('studentsRaisingHands', 900) },
  { icon: ShieldCheck, titleKey: 'home.pillar2.title', bodyKey: 'home.pillar2.body', image: '/private-by-design.png' },
  { icon: Zap, titleKey: 'home.pillar3.title', bodyKey: 'home.pillar3.body', image: '/built-for-daily-use.png' },
]

const capabilities = [
  { icon: Users, key: 'home.cap.studentManagement' },
  { icon: CalendarCheck, key: 'home.cap.attendance' },
  { icon: BookOpen, key: 'home.cap.grades' },
  { icon: ClipboardCheck, key: 'home.cap.homework' },
  { icon: Wallet, key: 'home.cap.fees' },
  { icon: Bell, key: 'home.cap.announcements' },
  { icon: MessageSquare, key: 'home.cap.messaging' },
  { icon: BarChart3, key: 'home.cap.reports' },
  { icon: CalendarRange, key: 'home.cap.academicYears' },
  { icon: GraduationCap, key: 'home.cap.teacherTools' },
]

function HeroVisual() {
  return (
    <figure className="hero-visual mx-auto w-full max-w-3xl min-w-0">
      <figcaption className="mb-3">
        <p className="text-sm font-semibold text-ink dark:text-white">Administrator workspace</p>
        <p className="text-xs text-graphite">Illustrative product preview</p>
      </figcaption>
      <AdministratorWorkspacePreview />
    </figure>
  )
}

const sampleActivityBars = [28, 40, 48, 58, 68, 81, 94]

const impactHighlights = [
  { icon: Buildings, title: 'Growing Network', description: 'School communities, connected.' },
  { icon: BookOpen, title: 'Active Learning', description: 'Learning stays part of the daily flow.' },
  { icon: ShieldCheck, title: 'Reliable & Secure', description: 'Thoughtful tools for school operations.' },
  { icon: Zap, title: 'Always On', description: 'Ready when the school day begins.' },
]

function FloatingAfricaMap() {
  return (
    <div className="hidden h-36 items-center justify-center overflow-visible md:flex" aria-hidden="true">
      <img className="home-africa-map home-africa-map--light h-[220px] w-auto max-w-full" src="/assets/africa-reference-map-light.png?v=5" alt="" width="1347" height="768" />
      <img className="home-africa-map home-africa-map--dark h-[168px] w-auto max-w-full" src="/assets/africa-reference-map.png" alt="" width="670" height="385" />
    </div>
  )
}

function LivePlatformSection() {
  return (
    <section className="home-live-platform bg-[#f7f8f6] py-10 dark:bg-[#171917] sm:py-14" aria-labelledby="home-proof-title">
      <div className="container">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-5 md:grid-cols-[1fr_0.9fr] md:gap-10">
            <div className="max-w-xl">
              <h2 id="home-proof-title" className="text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-ink dark:text-white sm:text-4xl">
                Trusted by schools.{' '}
                <span className="block text-accent">Live platform.</span>
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-graphite sm:text-base">
                Nom Cloud powers daily operations for schools. Real activity. Real impact.
              </p>
              <p className="mt-3 text-xs text-graphite">
                Illustrative metrics · sample data, not live production statistics
              </p>
            </div>

            <FloatingAfricaMap />
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-[#202320] sm:p-5">
              <div>
                <h3 className="text-base font-semibold text-ink dark:text-white">Platform activity</h3>
                <p className="mt-1 text-xs text-graphite">A snapshot of activity across the platform</p>
              </div>
              <div className="mt-5 grid grid-cols-[48px_minmax(0,1fr)_76px] items-end gap-3 sm:grid-cols-[56px_minmax(0,1fr)_100px] sm:gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-ink/10 text-accent dark:border-white/10 sm:h-14 sm:w-14" aria-hidden="true">
                  <BarChart3 className="h-6 w-6" weight="regular" />
                </span>
                <div className="min-w-0">
                  <p className="text-3xl font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink dark:text-white">12</p>
                  <p className="mt-1 text-sm font-medium text-accent">Activity events</p>
                  <p className="mt-1 text-[11px] leading-snug text-graphite">Sample · last 24 hours</p>
                </div>
                <div className="flex h-16 items-end gap-1" aria-hidden="true">
                  {sampleActivityBars.map((height, index) => (
                    <span
                      key={index}
                      className="min-w-0 flex-1 rounded-t-sm bg-accent/80"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-[#202320] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-ink dark:text-white">System status</h3>
                  <p className="mt-1 text-xs text-graphite">Illustrative monitoring preview</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live preview
                </span>
              </div>
              <div className="mt-5 grid grid-cols-[48px_minmax(0,1fr)_76px] items-end gap-3 sm:grid-cols-[56px_minmax(0,1fr)_100px] sm:gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-ink/10 text-emerald-600 dark:border-white/10 dark:text-emerald-400 sm:h-14 sm:w-14" aria-hidden="true">
                  <CheckCircle2 className="h-6 w-6" weight="regular" />
                </span>
                <div className="min-w-0">
                  <p className="text-3xl font-semibold leading-none tracking-[-0.03em] tabular-nums text-emerald-700 dark:text-emerald-400">99.8%</p>
                  <p className="mt-1 text-sm font-medium text-ink dark:text-white">Sample uptime</p>
                  <p className="mt-1 text-[11px] leading-snug text-graphite">Illustrative, not production data</p>
                </div>
                <svg className="h-16 w-full overflow-visible" viewBox="0 0 120 48" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <path d="M1 32C10 28 13 39 23 34C31 30 35 26 43 28C52 31 59 17 67 21C74 25 78 31 86 21C92 13 95 24 101 17C106 12 111 8 119 10" className="stroke-emerald-500/80 dark:stroke-emerald-400/80" strokeWidth="1.5" />
                  <path d="M1 32C10 28 13 39 23 34C31 30 35 26 43 28C52 31 59 17 67 21C74 25 78 31 86 21C92 13 95 24 101 17C106 12 111 8 119 10V48H1V32Z" className="fill-emerald-500/10 dark:fill-emerald-400/10" />
                </svg>
              </div>
            </article>
          </div>

          <div className="mt-3 rounded-xl border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-[#202320] sm:p-5">
            <h3 className="text-base font-semibold text-ink dark:text-white">Real impact</h3>
            <div className="mt-4 grid grid-cols-1 gap-x-5 divide-y divide-ink/10 dark:divide-white/10 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              {impactHighlights.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 sm:px-3 sm:py-2 sm:first:pl-0 sm:first:pt-2 sm:last:pb-2 lg:first:pl-0 lg:last:pr-0">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" weight="regular" aria-hidden="true" />
                  <div>
                    <h4 className="text-sm font-medium text-ink dark:text-white">{title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-graphite">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const { t } = useLanguage()

  return (
    <div className="public-home">
      <SEO
        title="Nom Cloud — Private School Management Software"
        description="Nom Cloud brings school administration, teaching, and family communication into one school-branded system."
        path="/"
      />
      {/* Hero */}
      <section className="home-hero pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div className="container grid items-center gap-10 lg:grid-cols-2">
          <div className="flex h-full flex-col justify-center">
            <h1 className="max-w-[18ch] text-display-lg text-ink dark:text-white">{t('hero.title')}</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-graphite">{t('hero.subtitle')}</p>
            <div className="mt-9">
              <Link to="/book-demo" className="btn-accent px-6 py-3 text-base">
                {t('cta.bookDemo')} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

          </div>

          <HeroVisual />
        </div>
      </section>

      <LivePlatformSection />

      {/* Pillars — Why Nom Cloud */}
      <section className="home-pillars section overflow-hidden">
        <div className="container">
          <div className="max-w-2xl">
            <h2 className="text-display-md text-ink dark:text-white">{t('home.why.title')}</h2>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {pillars.map((p) => (
              <article key={p.titleKey} className="overflow-hidden rounded-xl border border-ink/10 bg-white dark:border-white/10 dark:bg-[#202320]">
                <img src={p.image} alt="" loading="lazy" className="h-44 w-full object-cover" />
                <div className="p-5">
                  <p.icon className="h-5 w-5 text-brand" />
                  <h3 className="mt-3 text-lg font-semibold text-ink dark:text-white">{t(p.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">{t(p.bodyKey)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Teacher preview */}
      <section className="home-teacher section bg-white dark:bg-white/[0.02]">
        <div className="container grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="mt-5 text-display-md text-ink dark:text-white">{t('home.teacher.title')}</h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-graphite">{t('home.teacher.body')}</p>
            <ul className="mt-7 space-y-3">
              {['home.teacher.point1', 'home.teacher.point2', 'home.teacher.point3'].map((k) => (
                <li key={k} className="flex items-center gap-3 text-sm text-ink dark:text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <ArrowRight className="h-3 w-3" />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
            <div className="mt-8 overflow-hidden rounded-2xl shadow-soft">
              <img src="/teacher-students.png" alt="Students celebrating together with a trophy" className="h-40 w-full object-cover" loading="lazy" />
            </div>
          </Reveal>
          <Reveal delay={150}>
            <TeacherDashboardMock />
          </Reveal>
        </div>
      </section>

      {/* Parent preview */}
      <section className="home-parent section overflow-hidden">
        <div className="container grid items-center gap-14 lg:grid-cols-2">
          <Reveal className="order-2 flex justify-center lg:order-1" delay={150}>
            <ParentAppMock />
          </Reveal>
          <Reveal className="order-1 lg:order-2">
            <h2 className="mt-5 text-display-md text-ink dark:text-white">{t('home.parent.title')}</h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-graphite">{t('home.parent.body')}</p>
            <ul className="mt-7 space-y-3">
              {['home.parent.point1', 'home.parent.point2', 'home.parent.point3'].map((k) => (
                <li key={k} className="flex items-center gap-3 text-sm text-ink dark:text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <ArrowRight className="h-3 w-3" />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Capabilities marquee — Full Platform */}
      <section className="home-capabilities section overflow-hidden bg-white dark:bg-white/[0.02]">
        <div className="container">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-display-md text-ink dark:text-white">{t('home.platform.title')}</h2>
          </div>
        </div>
        <div className="container mt-8">
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-5">
            {capabilities.map((capability) => (
              <div key={capability.key} className="flex min-w-0 items-center gap-3 border-b border-ink/10 py-4 dark:border-white/10">
                <capability.icon className="h-5 w-5 flex-shrink-0 text-brand" />
                <p className="text-sm font-medium text-ink dark:text-white">{t(capability.key)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="container">
          <div className="mt-8">
            <Link to="/features" className="link-underline inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              {t('home.platform.explore')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta section">
        <div className="container">
          <div className="relative overflow-hidden rounded-xl border border-ink/10 bg-ink px-5 py-12 text-center dark:border-white/10 sm:px-10 sm:py-16">
            <img
              src={img('childrenWindow', 1600)}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
            <div className="absolute inset-0 bg-ink/70" />
            <div className="relative">
              <h2 className="text-display-md text-white">{t('home.cta.title')}</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80">{t('home.cta.body')}</p>
              <div className="mt-7 flex items-center justify-center">
                <Link to="/book-demo" className="btn-accent px-6 py-3 text-base">
                  {t('cta.bookDemo')} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
