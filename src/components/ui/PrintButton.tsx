import { Printer } from '@phosphor-icons/react'

export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ink/10 px-3.5 py-2 text-sm font-medium text-ink hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-white/15 dark:text-white dark:hover:bg-white/10"
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}
