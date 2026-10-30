import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { cn } from '@/utils/cn'

interface CountUpProps {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
  accent?: string
  className?: string
}

export default function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1800,
  accent = '#FF5A1F',
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<number | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    startedRef.current = false

    const start = () => {
      if (startedRef.current) return
      startedRef.current = true
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReducedMotion) {
        setDisplay(value)
        return
      }

      setDisplay(0)
      setIsRunning(true)
      const startTime = performance.now()
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(value * eased)
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(tick)
        } else {
          setDisplay(value)
          setIsRunning(false)
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      startedRef.current = true
      return
    }
    if (!('IntersectionObserver' in window)) {
      start()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !startedRef.current) {
          observer.disconnect()
          start()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  const finalValue = `${prefix}${value.toFixed(decimals)}${suffix}`
  const visualValue = display.toFixed(decimals).padStart(value.toFixed(decimals).length, '\u00a0')

  return (
    <span
      ref={ref}
      className={cn(className, 'count-up', isRunning ? 'count-running' : 'count-done')}
      style={{ '--count-accent': accent } as CSSProperties}
    >
      <span className="count-up__visual" aria-hidden="true">
      {prefix}
      <span className="count-up__number">
        {visualValue.split('').map((character, index) => {
          if (!/\d/.test(character)) {
            return <span key={`${index}-${character}`} className="count-up__separator">{character}</span>
          }
          const digit = Number(character)
          return (
            <span className="count-up__digit-window" key={index}>
              <span className="count-up__digit-strip" style={{ transform: `translateY(-${digit * 10}%)` }}>
                {Array.from({ length: 10 }, (_, number) => <span key={number}>{number}</span>)}
              </span>
            </span>
          )
        })}
      </span>
      {suffix}
      </span>
      <span className="sr-only">{finalValue}</span>
    </span>
  )
}
