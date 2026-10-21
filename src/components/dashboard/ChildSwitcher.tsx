import { useEffect, useRef, useState } from 'react'
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react'
import Avatar from '@/components/ui/Avatar'
import type { ChildSummary } from '@/services/guardianService'
import { cn } from '@/utils/cn'

// Phase 8 batch 3: takes real students resolved through student_guardians
// rather than the mock Student type. Field names are unchanged, so the markup
// below did not need to move.
interface ChildSwitcherProps {
  children: ChildSummary[]
  selectedId?: string
  onSelect: (id: string) => void
  classLabel?: (child: ChildSummary) => string
}

export default function ChildSwitcher({ children, selectedId, onSelect, classLabel }: ChildSwitcherProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = children.find((c) => c.id === selectedId) ?? children[0]

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!selected) return null
  if (children.length === 1) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
        <Avatar name={selected.name} color={selected.avatarColor} size="sm" />
        <div>
          <p className="text-sm font-medium text-ink dark:text-white">{selected.name}</p>
          {classLabel && <p className="text-xs text-graphite">{classLabel(selected)}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-2.5 transition-colors hover:border-ink/25 dark:border-white/10 dark:bg-white/5"
      >
        <Avatar name={selected.name} color={selected.avatarColor} size="sm" />
        <div className="text-left">
          <p className="text-sm font-medium text-ink dark:text-white">{selected.name}</p>
          {classLabel && <p className="text-xs text-graphite">{classLabel(selected)}</p>}
        </div>
        <ChevronDown className="h-4 w-4 text-graphite" />
      </button>
      {open && (
        <div className="interaction-menu absolute right-0 top-14 z-40 w-64 overflow-hidden rounded-2xl border border-ink/5 bg-white shadow-floaty animate-fade-up dark:border-white/10 dark:bg-[#161618]">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => {
                onSelect(child.id)
                setOpen(false)
              }}
              aria-pressed={child.id === selected.id}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.03] dark:hover:bg-white/5',
                child.id === selected.id && 'bg-accent/5',
              )}
            >
              <Avatar name={child.name} color={child.avatarColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink dark:text-white">{child.name}</p>
                {classLabel && <p className="truncate text-xs text-graphite">{classLabel(child)}</p>}
              </div>
              {child.id === selected.id && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
