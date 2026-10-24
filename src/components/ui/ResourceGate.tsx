import { Warning as AlertTriangle } from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import AccessDenied from '@/components/ui/AccessDenied'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Loader'
import { useLanguage } from '@/context/LanguageContext'
import type { ResourceState } from '@/lib/resourceState'

interface ResourceGateProps<T> {
  state: ResourceState<T>
  /** Copy for the `empty` state. Unchanged in spirit from what pages use today. */
  empty: { title: string; description?: string; icon?: PhosphorIcon; action?: ReactNode }
  /** Optional secondary line on `denied`. Never explains what is being withheld. */
  deniedHint?: string
  /** Override the default skeleton where a page needs a different shape. */
  loading?: ReactNode
  children: (data: T) => ReactNode
}

/**
 * Renders exactly one of the contract states from
 * docs/PHASE8_CONNECTION_PLAN.md section F.7.
 *
 * Every later Phase 8 batch routes its domain reads through this component, so
 * loading, empty, denied and error look the same everywhere and the denied
 * wording cannot drift. Pages supply only their own empty copy and their own
 * content.
 *
 * Usage:
 *
 *   const state = deriveResourceState({ isLoading, error, data: students })
 *
 *   <ResourceGate state={state} empty={{ title: 'No students yet' }}>
 *     {(students) => <StudentTable students={students} />}
 *   </ResourceGate>
 */
export default function ResourceGate<T>({
  state,
  empty,
  deniedHint,
  loading,
  children,
}: ResourceGateProps<T>) {
  const { t } = useLanguage()
  switch (state.status) {
    case 'loading':
      return (
        <div role="status" aria-live="polite" aria-busy="true" aria-label={t('app.loading.content')}>
          {loading ?? <SkeletonRows />}
        </div>
      )

    case 'denied':
      return <AccessDenied hint={deniedHint} />

    case 'error':
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          description={state.error.message}
          action={
            state.retry ? (
              <button type="button" onClick={state.retry} className="btn-accent px-5 py-2.5 text-sm">
                Try again
              </button>
            ) : undefined
          }
        />
      )

    case 'empty':
      return (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          action={empty.action}
        />
      )

    case 'ready':
      return <>{children(state.data)}</>
  }
}
