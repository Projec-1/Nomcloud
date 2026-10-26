import { Check, ShieldCheck } from '@phosphor-icons/react'
import { ThinkingOrb } from 'thinking-orbs'

export default function RequestProcessing({
  title = 'Sending your request',
  description = 'We are securely sending your information to Nom Cloud.',
  compact = false,
}: {
  title?: string
  description?: string
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#FF5A1F]/15 bg-[#fffaf8] px-4 py-3 text-left dark:bg-[#FF5A1F]/10" role="status" aria-live="polite">
        <ThinkingOrb state="working" size={20} color="#C9471B" className="shrink-0" aria-label={title} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs text-graphite">{description}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-12 text-center animate-fade-up" role="status" aria-live="polite">
      <ThinkingOrb state="working" size={64} color="#C9471B" aria-label={title} />
      <h3 className="mt-7 text-2xl font-semibold tracking-tight text-ink dark:text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-graphite">{description}</p>

      <div className="mt-8 w-full max-w-sm space-y-3 text-left">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" /></span>
          <span>Information reviewed</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-[#fff7f3] px-4 py-3 text-sm text-[#c94316] dark:bg-[#FF5A1F]/10 dark:text-[#ff8b62]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF5A1F] text-white">
            <ThinkingOrb state="working" size={20} color="#FFFFFF" aria-label="Submitting request" />
          </span>
          <span>Securely submitting to Nom Cloud</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-mist px-4 py-3 text-sm text-graphite dark:bg-white/5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-ink/10 dark:border-white/15"><ShieldCheck className="h-3.5 w-3.5" /></span>
          <span>Preparing your confirmation</span>
        </div>
      </div>
    </div>
  )
}
