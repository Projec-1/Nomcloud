import { CheckCircle, type Icon } from '@phosphor-icons/react'

export default function PaymentMethodCard({
  icon: IconComponent,
  label,
  description,
  selected,
  mark,
  groupLabel,
  selectionRole = 'radio',
  onSelect,
}: {
  icon: Icon
  label: string
  description: string
  selected: boolean
  mark?: string
  groupLabel?: string
  selectionRole?: 'radio' | 'button'
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role={selectionRole}
      aria-checked={selectionRole === 'radio' ? selected : undefined}
      aria-pressed={selectionRole === 'button' ? selected : undefined}
      onClick={onSelect}
      className={`flex min-h-[68px] w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        selected
          ? 'border-brand bg-brand/[0.06] dark:bg-brand/10'
          : 'border-ink/10 bg-white hover:border-brand/40 dark:border-white/10 dark:bg-[#202328] dark:hover:border-brand/50'
      }`}
    >
      <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-ink/[0.04] px-2 text-xs font-bold tracking-wide text-ink dark:bg-white/10 dark:text-white">
        {mark || <IconComponent className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-ink dark:text-white">{label}</span>
        {groupLabel && <span className="mt-0.5 block text-[11px] text-graphite">{groupLabel}</span>}
        {description && <span className="mt-1 block break-words text-xs leading-relaxed text-graphite">{description}</span>}
      </span>
      {selected && <CheckCircle className="h-5 w-5 shrink-0 text-brand" weight="fill" aria-hidden="true" />}
    </button>
  )
}
