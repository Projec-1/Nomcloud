/**
 * The status badge shared by the Operator Control Center screens.
 *
 * It used to be declared inside Workspace.tsx, which meant the Overview, the
 * schools table and the request queue could drift apart. One definition keeps
 * the typography and tones identical everywhere, and every colour carries both
 * a light and a dark value so the badge stays readable in either theme.
 */
export const statusStyle: Record<string, string> = {
  Active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'Under review': 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Suspended: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Closed: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  Open: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'In review': 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Resolved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

export default function Status({ value }: { value: string }) {
  return (
    <span className={`inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 whitespace-normal break-words rounded-full px-2.5 py-1 text-left text-xs font-semibold leading-4 ${statusStyle[value] ?? 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {value}
    </span>
  )
}
