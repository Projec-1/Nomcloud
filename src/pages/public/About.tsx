import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import { useLanguage } from '@/context/LanguageContext'
import { img } from '@/data/images'

const steps = [
  {
    number: '01',
    titleKey: 'about.process.step1.title',
    bodyKey: 'about.process.step1.body',
    image: img('teacherWithLearners', 1200),
    alt: 'A teacher leading a lesson with students',
  },
  {
    number: '02',
    titleKey: 'about.process.step2.title',
    bodyKey: 'about.process.step2.body',
    image: img('studentsRaisingHands', 1200),
    alt: 'Students taking part in a classroom lesson',
  },
  {
    number: '03',
    titleKey: 'about.process.step3.title',
    bodyKey: 'about.process.step3.body',
    image: img('teacherTutoring', 1200),
    alt: 'A teacher helping students with their learning',
  },
  {
    number: '04',
    titleKey: 'about.process.step4.title',
    bodyKey: 'about.process.step4.body',
    image: img('childrenWindow', 1200),
    alt: 'Students learning together in their classroom',
  },
  {
    number: '05',
    titleKey: 'about.process.step5.title',
    bodyKey: 'about.process.step5.body',
    image: img('classroomChildren', 1200),
    alt: 'Students working together at school',
  },
]

export default function About() {
  const { t } = useLanguage()

  return (
    <div className="about-process bg-mist text-ink dark:bg-[#17191C] dark:text-white">
      <SEO
        title="About Nom Cloud"
        description="Learn how Nom Cloud brings school records, classroom routines, learning updates, and family communication into one platform."
        path="/about"
      />
      <section className="relative isolate flex min-h-[470px] items-center overflow-hidden bg-ink sm:min-h-[530px]">
        <img src={img('classroomChildren', 2000, 85)} alt="" width="2000" height="1200" className="absolute inset-0 h-full w-full scale-[1.03] object-cover object-center opacity-70 blur-[1px]" />
        <div aria-hidden="true" className="absolute inset-0 bg-ink/60" />
        <div className="relative mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
              Nom Cloud <span className="mx-2 text-white/60">/</span> {t('about.process.eyebrow')}
            </p>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-6xl">
              {t('about.process.heroTitle')}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
              {t('about.process.heroBody')}
            </p>
          </div>
        </div>
      </section>

      <section id="process" aria-labelledby="process-heading" className="relative overflow-hidden px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl sm:mb-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{t('about.process.eyebrow')}</p>
            <h2 id="process-heading" className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">
              {t('about.process.sectionTitle')}
            </h2>
          </div>
          <svg aria-hidden="true" className="about-process-path pointer-events-none absolute inset-x-[12%] top-[14rem] hidden h-[calc(100%-17rem)] w-[76%] md:block" viewBox="0 0 100 1000" preserveAspectRatio="none">
            <path d="M50 0 C51 78 54 91 52 166 S47 244 49 332 S54 402 52 500 S47 582 49 668 S54 748 52 835 S47 920 50 1000" fill="none" stroke="#C9471B" strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity=".45" />
          </svg>
          <div className="relative space-y-16 sm:space-y-24">
            {steps.map((step, index) => (
              <article key={step.number} className="relative z-10 grid items-center gap-7 md:min-h-[230px] md:grid-cols-2 md:gap-16">
                <div className={`${index % 2 === 1 ? 'md:order-2' : ''} min-w-0`}>
                  <span aria-hidden="true" className="about-process-number block w-full select-none text-center md:text-left" style={{ backgroundImage: `url("${step.image}")` }}>
                    {step.number}
                  </span>
                  <span className="sr-only">{step.alt}</span>
                </div>
                <div className={`${index % 2 === 1 ? 'md:order-1 md:text-right' : ''} max-w-xl ${index % 2 === 1 ? 'md:ml-auto' : ''}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                    Nom Cloud <span className="mx-1.5 text-graphite/70">/</span> {step.number}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl">
                    {t(step.titleKey)}
                  </h3>
                  <p className="mt-4 max-w-[42ch] text-sm leading-7 text-graphite dark:text-[#c0c9c4] md:text-base">
                    {t(step.bodyKey)}
                  </p>
                  {index === steps.length - 1 && (
                    <Link to="/book-demo" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold !text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                      {t('cta.bookDemo')} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
