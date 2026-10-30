import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
  variant?: 'default' | 'media'
}

export default function Reveal({ children, className, delay = 0, variant = 'default' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={['motion-reveal', className].filter(Boolean).join(' ')}
      data-visible={visible}
      data-reveal-style={variant}
      style={{ '--reveal-delay': `${Math.max(0, Math.min(delay, 240))}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}
