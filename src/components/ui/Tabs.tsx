import { cn } from '@/utils/cn'

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs flex flex-wrap items-center gap-1.5 rounded-full bg-ink/5 p-1.5 dark:bg-white/5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200',
            active === tab.id
              ? 'bg-[var(--nc-accent-soft)] text-[var(--nc-text)] ring-1 ring-inset ring-brand/20'
              : 'text-graphite hover:bg-[var(--nc-surface)] hover:text-ink dark:hover:text-white',
          )}
        >
          {tab.label}
          {typeof tab.count === 'number' && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-xs', active === tab.id ? 'bg-ink/10 dark:bg-white/15' : 'bg-ink/5 dark:bg-white/10')}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
