import type { ReactNode } from 'react'
import Logo from '@/components/layout/Logo'
import { useLanguage } from '@/context/LanguageContext'

export default function AuthLayout({
  children,
  title,
  subtitle,
  singleScreen = false,
}: {
  children: ReactNode
  title: string
  subtitle: string
  singleScreen?: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className={`auth-page min-h-screen bg-mist dark:bg-[#171917] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.9fr)] ${singleScreen ? 'auth-page--single-screen' : ''}`}>
      <main className="flex min-w-0 flex-col justify-center px-4 py-8 sm:px-10 sm:py-12 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <Logo className={singleScreen ? 'mb-5 sm:mb-6' : 'mb-8 sm:mb-10'} />
          <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-[48ch] text-sm leading-6 text-graphite">{subtitle}</p>
          <div className={`${singleScreen ? 'mt-4' : 'mt-7 sm:mt-8'} rounded-xl border border-ink/10 bg-white p-5 dark:border-white/10 dark:bg-[#202320] sm:p-7`}>{children}</div>
        </div>
      </main>
      <aside className="hidden min-h-full border-l border-ink/10 bg-white p-10 dark:border-white/10 dark:bg-[#202320] lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="flex items-center gap-3 text-sm font-semibold text-ink dark:text-white">
          <img src="/logo-512.png" alt="" className="h-8 w-8 object-contain" />
          Nom Cloud
        </div>
        <div className="my-16 max-w-xl">
          <p className="text-sm font-medium text-accent">{t('auth.layout.eyebrow')}</p>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-ink dark:text-white xl:text-5xl">
            {t('auth.layout.title')}
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-graphite">
            {t('auth.layout.description')}
          </p>
          <div className="mt-10 border-t border-ink/10 pt-5 dark:border-white/10">
            <p className="text-sm font-medium text-ink dark:text-white">{t('auth.layout.community')}</p>
            <p className="mt-1 text-sm text-graphite">{t('auth.layout.privacy')}</p>
          </div>
        </div>
        <p className="text-xs text-graphite">{t('auth.layout.platform')}</p>
      </aside>
    </div>
  )
}
