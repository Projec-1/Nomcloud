import { useState } from 'react'
import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import Reveal from '@/components/marketing/Reveal'

export interface FaqItem {
  q: string
  a: string
}

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i
        return (
          <Reveal key={item.q} delay={i * 60}>
            <div className="card overflow-hidden">
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
              >
                <span className="text-sm font-semibold text-ink dark:text-white">{item.q}</span>
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink/5 text-graphite transition-transform duration-300 dark:bg-white/10 ${
                    isOpen ? 'rotate-180 bg-brand/10 text-brand' : ''
                  }`}
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-apple"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <p className="px-6 pb-5 text-sm leading-relaxed text-graphite">{item.a}</p>
                </div>
              </div>
            </div>
          </Reveal>
        )
      })}
    </div>
  )
}
