import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Buildings as School, GraduationCap, Users, BookOpen } from '@phosphor-icons/react'
import SEO from '@/components/layout/SEO'
import Reveal from '@/components/marketing/Reveal'
import Tabs from '@/components/ui/Tabs'
import AdministratorWorkspacePreview from '@/components/marketing/previews/AdministratorWorkspacePreview'
import TeacherDashboardMock from '@/components/marketing/previews/TeacherDashboardMock'
import ParentAppMock from '@/components/marketing/previews/ParentAppMock'
import FeatureMock from '@/components/marketing/previews/FeatureMock'
import { useLanguage } from '@/context/LanguageContext'

type SolutionId = 'admin' | 'teacher' | 'parent' | 'student'

const solutions: Record<
  SolutionId,
  { icon: typeof School; prefix: string; points: string[]; mock: SolutionId }
> = {
  admin: { icon: School, prefix: 'solutions.admin', points: ['point1', 'point2', 'point3', 'point4', 'point5'], mock: 'admin' },
  teacher: { icon: GraduationCap, prefix: 'solutions.teacher', points: ['point1', 'point2', 'point3', 'point4'], mock: 'teacher' },
  parent: { icon: Users, prefix: 'solutions.parent', points: ['point1', 'point2', 'point3', 'point4'], mock: 'parent' },
  student: { icon: BookOpen, prefix: 'solutions.student', points: ['point1', 'point2', 'point3'], mock: 'student' },
}

export default function Solutions() {
  const { t } = useLanguage()
  const [active, setActive] = useState<SolutionId>('admin')
  const solution = solutions[active]

  return (
    <div>
      <SEO
        title="Solutions for Administrators, Teachers & Parents"
        description="See how Nom Cloud works for school administrators, teachers and parents — one platform, three purpose-built experiences."
        path="/solutions"
      />
      <section className="pt-20 pb-8 sm:pt-28">
        <div className="container text-center">
          <Reveal>
            <span className="eyebrow">{t('solutions.eyebrow')}</span>
            <h1 className="mx-auto mt-6 max-w-3xl text-display-lg text-ink dark:text-white">{t('solutions.title')}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-graphite">{t('solutions.subtitle')}</p>
          </Reveal>
          <Reveal delay={150} className="mt-10 flex justify-center">
            <Tabs
              tabs={[
                { id: 'admin', label: t('solutions.tab.admin') },
                { id: 'teacher', label: t('solutions.tab.teacher') },
                { id: 'parent', label: t('solutions.tab.parent') },
                { id: 'student', label: t('solutions.tab.student') },
              ]}
              active={active}
              onChange={(id) => setActive(id as SolutionId)}
            />
          </Reveal>
        </div>
      </section>

      <section className="section pt-8">
        <div className="container grid items-center gap-14 lg:grid-cols-2">
          <div key={active} className="animate-fade-up">
            <span className="eyebrow">{t(`${solution.prefix}.eyebrow`)}</span>
            <h2 className="mt-5 text-display-md text-ink dark:text-white">{t(`${solution.prefix}.title`)}</h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-graphite">{t(`${solution.prefix}.body`)}</p>
            <ul className="mt-7 space-y-3">
              {solution.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-ink dark:text-white">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <ArrowRight className="h-3 w-3" />
                  </span>
                  {t(`${solution.prefix}.${p}`)}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link to="/features" className="btn-accent px-6 py-3.5 text-sm">
                {t('solutions.seeFeatures')} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/pricing" className="btn-outline px-6 py-3.5 text-sm">
                {t('solutions.viewPricing')}
              </Link>
            </div>
          </div>
          <div key={`${active}-mock`} className="flex animate-fade-up justify-center">
            {solution.mock === 'admin' && <AdministratorWorkspacePreview interactive />}
            {solution.mock === 'teacher' && <TeacherDashboardMock />}
            {solution.mock === 'parent' && <ParentAppMock />}
            {solution.mock === 'student' && (
              <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="card p-5">
                  <p className="mb-3 text-sm font-medium text-ink dark:text-white">{t('solutions.mock.homework')}</p>
                  <FeatureMock variant="list" tint="#0071E3" />
                </div>
                <div className="card p-5">
                  <p className="mb-3 text-sm font-medium text-ink dark:text-white">{t('solutions.mock.grades')}</p>
                  <FeatureMock variant="chart" tint="#FF5A1F" />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
