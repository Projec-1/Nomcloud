import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { cn } from '@/utils/cn'

export function PageLoader() {
  return (
    <div
      role="status"
      aria-label="Loading Nom Cloud"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-h-[100svh] items-center justify-center bg-[var(--nc-canvas)]"
    >
      <img
        src="/logo-512.png"
        alt=""
        aria-hidden="true"
        className="nc-startup-loader__logo h-20 w-20 object-contain"
      />
    </div>
  )
}

export function InlineLoader({
  label,
  state = 'working',
  className,
}: {
  label: string
  state?: OrbState
  className?: string
}) {
  return (
    <span role="status" aria-live="polite" aria-label={label} className={cn('inline-flex min-h-5 items-center gap-2', className)}>
      <ThinkingOrb state={state} size={20} color="#C9471B" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('nc-skeleton rounded-xl', className)} />
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}
