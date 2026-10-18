import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard } from '@phosphor-icons/react'
import LanguageSwitcher from '@/components/layout/LanguageSwitcher'
import { useLanguage } from '@/context/LanguageContext'

const columns = [
  {
    titleKey: 'footer.product',
    links: [
      { key: 'nav.solutions', to: '/solutions' },
      { key: 'nav.features', to: '/features' },
      { key: 'nav.pricing', to: '/pricing' },
      { key: 'nav.security', to: '/security' },
    ],
  },
  {
    titleKey: 'footer.company',
    links: [
      { key: 'nav.about', to: '/about' },
      { key: 'nav.contact', to: '/contact' },
      { key: 'nav.login', to: '/login' },
      { key: 'footer.signup', to: '/signup' },
    ],
  },
  {
    titleKey: 'footer.platform',
    links: [
      { key: 'footer.adminDashboard', to: '/signup' },
      { key: 'footer.teacherPortal', to: '/signup' },
      { key: 'footer.parentApp', to: '/signup' },
    ],
  },
  {
    titleKey: 'footer.legal',
    links: [
      { key: 'footer.privacy', to: '/privacy' },
      { key: 'footer.terms', to: '/terms' },
      { key: 'footer.cookies', to: '/cookies' },
    ],
  },
]

export default function PublicFooter() {
  const { t } = useLanguage()
  const footerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const logoWrap = footer.querySelector('.footer-logo-wrap') as HTMLElement | null
    if (!logoWrap) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      logoWrap.classList.add('is-visible')
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          logoWrap.classList.add('is-visible')
          observer.disconnect()
        }
      },
      { threshold: 0.35 },
    )

    observer.observe(logoWrap)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <style>{`
        .footer-shell {
          position: relative;
          overflow: hidden;
          background: #ff4500;
          color: #fff;
        }

        .footer-logo-wrap {
          position: relative;
          display: block;
          width: 100%;
          margin-top: 0;
          overflow: hidden;
          border-top: none;
          background: #ff4500;
          line-height: 0;
          padding: 0;
        }

        .footer-logo-wrap .logo-image {
          display: block;
          width: 100%;
          max-width: none;
          height: auto;
          object-fit: contain;
          object-position: center bottom;
          margin: 0;
          margin-bottom: -0.55rem;
          opacity: 0;
          filter: blur(8px);
          transform: translate3d(0, 10px, 0) scale(0.92);
          transform-origin: center bottom;
        }

        @media (min-width: 768px) {
          .footer-logo-wrap .logo-image {
            width: calc(100% + 3rem);
            margin-left: -1.5rem;
            margin-right: -1.5rem;
          }
        }

        @media (max-width: 640px) {
          .footer-logo-wrap .logo-image {
            margin-bottom: -0.3rem;
          }
        }

        .footer-logo-wrap.is-visible .logo-image {
          animation: footerLogoReveal 2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes footerLogoReveal {
          0% {
            opacity: 0;
            filter: blur(8px);
            transform: translate3d(0, 10px, 0) scale(0.92);
          }
          30% {
            opacity: 0.45;
            filter: blur(5px);
            transform: translate3d(0, 7px, 0) scale(0.96);
          }
          60% {
            opacity: 0.8;
            filter: blur(2px);
            transform: translate3d(0, 3px, 0) scale(0.99);
          }
          100% {
            opacity: 1;
            filter: blur(0);
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .footer-logo-wrap .logo-image {
            animation: none !important;
            opacity: 1; filter: none; transform: none;
          }
        }
      `}</style>

      <footer ref={footerRef} className="footer-shell text-white">
        <div className="container relative py-16">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
            <div className="col-span-2">
              <Link to="/" className="group inline-flex items-center gap-2.5 text-white">
                <img
                  src="/logo_white_transparent.png"
                  alt="Nom Cloud"
                  className="h-8 w-8 shrink-0 object-contain"
                  draggable={false}
                />
                <span className="text-[1.05rem] font-semibold tracking-tight text-white">Nom Cloud</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/80">{t('footer.tagline')}</p>
            </div>
            {columns.map((col) => (
              <div key={col.titleKey}>
                <h4 className="text-sm font-semibold text-white">{t(col.titleKey)}</h4>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.key}>
                      <Link to={link.to} className="link-underline text-sm text-white/80 hover:text-white">
                        {t(link.key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/20 pt-8 sm:flex-row">
            <p className="text-xs text-white/80">© {new Date().getFullYear()} Nom Cloud. {t('footer.rights')}</p>
            <div className="flex items-center gap-4">
              <p className="hidden items-center gap-1.5 text-xs text-white/80 sm:flex">
                <CreditCard className="h-3.5 w-3.5" /> {t('footer.tagline2')}
              </p>
              <div className="flex items-center gap-2 text-xs text-white/85">
                <span className="hidden sm:inline">{t('footer.language')}:</span>
                <LanguageSwitcher className="[&_.language-switcher-trigger]:!text-white/90 [&_.language-switcher-trigger:hover]:!text-[#FF4500] [&_.language-switcher-trigger:hover]:!bg-white" />
              </div>
            </div>
          </div>
        </div>

        <div className="footer-logo-wrap">
          <img
            src="/nomcloud_logo_black.png"
            alt="Nom Cloud"
            className="logo-image"
            draggable={false}
          />
        </div>
      </footer>
    </>
  )
}
