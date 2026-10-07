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
  const [isDone, setIsDone] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<number | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const start = () => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReducedMotion) {
        setDisplay(value)
        setIsDone(true)
        return
      }

      setDisplay(0)
      setIsDone(false)
      const startTime = performance.now()
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(value * eased)
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(tick)
        } else {
          setDisplay(value)
          setIsDone(true)
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !startedRef.current) {
          startedRef.current = true
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

  return (
    <span
      ref={ref}
      className={cn(className, isDone ? 'count-done' : 'count-running')}
      style={{ '--count-accent': accent } as CSSProperties}
    >
      {prefix}
      <span className={isDone ? 'text-accent' : ''}>
        {display.toFixed(decimals)}
      </span>
      {suffix}
    </span>
  )
}
