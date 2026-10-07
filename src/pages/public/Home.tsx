import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Lightning as Zap, Users, CalendarCheck, BookOpen, Wallet, Bell, ChatText as MessageSquare, ChartBar as BarChart3, ClipboardText as ClipboardCheck, GraduationCap, CalendarBlank as CalendarRange, Buildings, UserCircle, Heart, ThumbsUp, CheckCircle as CheckCircle2 } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import AdministratorWorkspacePreview from '@/components/marketing/previews/AdministratorWorkspacePreview'
import TeacherDashboardMock from '@/components/marketing/previews/TeacherDashboardMock'
import ParentAppMock from '@/components/marketing/previews/ParentAppMock'
import CountUp from '@/components/marketing/CountUp'
import { useInView } from '@/hooks/useInView'
import { useLanguage } from '@/context/LanguageContext'
import { img } from '@/data/images'

const pillars = [
  { icon: Users, titleKey: 'home.pillar1.title', bodyKey: 'home.pillar1.body', image: img('studentsRaisingHands', 900) },
  { icon: ShieldCheck, titleKey: 'home.pillar2.title', bodyKey: 'home.pillar2.body', image: '/ARDO%20GBDHIO.png' },
  { icon: Zap, titleKey: 'home.pillar3.title', bodyKey: 'home.pillar3.body', image: '/ardayaschoolphoto.png' },
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

function SocialProofArc() {
  const { t } = useLanguage()
  const { ref, inView } = useInView<HTMLDivElement>()
  const people = [
    { icon: Buildings, style: 'left-[13%] top-[58%]', tone: 'bg-brand/10 text-brand' },
    { icon: UserCircle, style: 'left-[31%] top-[28%]', tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { icon: GraduationCap, style: 'left-1/2 top-[44%]', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    { icon: UserCircle, style: 'left-[69%] top-[28%]', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    { icon: Buildings, style: 'left-[87%] top-[58%]', tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  ]

  return (
    <section className="home-social-proof overflow-hidden py-8 sm:py-12" aria-labelledby="home-proof-title">
      <div className="container">
        <div ref={ref} className={`home-social-proof__content mx-auto max-w-5xl${inView ? ' is-visible' : ''}`}>
          <div className="relative mx-auto aspect-[1000/340] min-h-[190px] w-full sm:min-h-0" aria-hidden="true">
            <svg className="home-social-proof__arcs absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 340" preserveAspectRatio="none" fill="none">
              <path d="M45 330C130 54 870 54 955 330" className="home-social-proof__arc home-social-proof__arc--outer stroke-ink/10 dark:stroke-white/15" strokeWidth="1.5" />
              <path d="M180 330C260 142 740 142 820 330" className="home-social-proof__arc home-social-proof__arc--inner stroke-ink/10 dark:stroke-white/15" strokeWidth="1.5" />
            </svg>
            {people.map(({ icon: Icon, style, tone }, index) => (
              <span
                key={`${style}-${index}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${style}`}
              >
                <span className={`home-social-proof__node home-social-proof__node--${index + 1} relative flex h-10 w-10 items-center justify-center rounded-full border border-white bg-white shadow-[0_8px_24px_rgba(20,30,25,0.10)] sm:h-12 sm:w-12 dark:border-white/10 dark:bg-[#202320]`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full sm:h-10 sm:w-10 ${tone}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  {index % 2 === 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white dark:border-[#202320]">
                      <CheckCircle2 className="h-3 w-3" weight="fill" />
                    </span>
                  ) : (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 text-white dark:border-[#202320]">
                      {index === 1 ? <Heart className="h-2.5 w-2.5" weight="fill" /> : <ThumbsUp className="h-2.5 w-2.5" weight="fill" />}
                    </span>
                  )}
                </span>
              </span>
            ))}
          </div>

          <div className="relative -mt-3 sm:-mt-8">
            <div className="home-social-proof__metrics grid grid-cols-3 divide-x divide-ink/10 dark:divide-white/10">
              {[
                { value: 50, suffix: '+', label: 'home.proof.schools' },
                { value: 10, label: 'home.proof.tools' },
                { value: 4.9, decimals: 1, suffix: '/5', label: 'home.proof.rating' },
              ].map(({ value, decimals, suffix, label }) => (
                <div key={label} className="px-2 text-center sm:px-6">
                  <p className="text-2xl font-semibold tracking-tight tabular-nums text-ink sm:text-4xl dark:text-white">
                    <CountUp value={value} decimals={decimals} suffix={suffix} duration={1200} accent="currentColor" className="home-social-proof__count" />
                  </p>
                  <p className="mt-1 text-[11px] leading-tight text-graphite sm:text-sm">{t(label)}</p>
                </div>
              ))}
            </div>
            <h2 id="home-proof-title" className="home-social-proof__headline mt-6 text-center text-xl font-semibold tracking-tight text-ink sm:text-2xl dark:text-white">
              {t('home.proof.title')}
            </h2>
            <div className="home-social-proof__pills mt-5 flex flex-wrap justify-center gap-2">
              {['home.proof.attendance', 'home.proof.grades', 'home.proof.fees', 'home.proof.families'].map((label) => (
                <span key={label} className="rounded-full border border-ink/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-graphite dark:border-white/10 dark:bg-white/[0.04]">
                  {t(label)}
                </span>
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

            <div className="mt-8 w-full max-w-[560px] rounded-[30px] border border-[#e8e2dc] bg-[#f7f3f0] p-4 shadow-[0_20px_42px_rgba(15,23,42,0.06)] sm:p-5">
              <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>Trusted by schools</span>
                <span className="rounded-full border border-[#e8e2dc] bg-white/80 px-2 py-1 text-[9px] text-slate-600">Live platform</span>
              </div>

              <div className="relative overflow-hidden rounded-[26px] border border-[#ece5df] bg-[#f3efe9] px-3 pb-3 pt-2">
                <svg className="absolute inset-x-0 top-4 h-28 w-full" viewBox="0 0 520 150" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <path d="M8 92C38 38, 101 8, 150 28C185 42, 204 77, 219 92C250 123, 299 125, 340 92C370 68, 405 36, 467 42C496 45, 513 59, 512 92" stroke="#ef5ca8" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
                  <path d="M70 118C116 120, 142 90, 176 76C215 61, 280 62, 324 95C356 118, 386 128, 440 124" stroke="#f57b43" strokeWidth="16" strokeLinecap="round" opacity="0.9" />
                </svg>

                <div className="relative z-10 flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8d1cb] bg-[#f6f1ee] text-[10px] font-semibold text-slate-700 shadow-sm">A</div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8d1cb] bg-[#efddcb] text-[10px] font-semibold text-slate-700 shadow-sm">B</div>
                  </div>

                  <div className="flex items-center gap-2 rounded-full border border-[#ebddd3] bg-white/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-sm">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f5a85b]" />
                    12 New posts
                  </div>
                </div>

                <div className="relative z-10 mt-10 flex items-end justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-[#d5cec8] bg-white shadow-[0_18px_30px_rgba(15,23,42,0.08)]">
                    <div className="h-10 w-12 rounded-xl bg-[#f0efe9]" />
                  </div>
                </div>

                <div className="relative z-10 mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    { value: '99.8%', label: 'Uptime' },
                    { value: '50+', label: 'Schools' },
                    { value: '4.9★', label: 'Rating' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[#e5ddd6] bg-white/80 px-2 py-2 shadow-sm">
                      <div className="text-lg font-semibold tracking-[-0.06em] text-slate-900 sm:text-2xl">{item.value}</div>
                      <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      <SocialProofArc />

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
              <img src={img('teacherTutoring', 700)} alt="A teacher helping a student one-on-one" className="h-40 w-full object-cover" loading="lazy" />
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
