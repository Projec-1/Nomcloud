import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { deriveResourceState, type ResourceState } from '@/lib/resourceState'
import { fetchChildFeeRecords, fetchFeeRecords, type FeeRecordView } from '@/services/financeService'
import { DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { toError } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Finance reads through the four-state contract. Phase 8 batch 6.
//
// WHY `denied` MATTERS MORE HERE THAN ANYWHERE ELSE IN PHASE 8.
//
// A principal or teacher holds NO policy on fee_records or fee_payments, so
// their read succeeds and returns zero rows. That is indistinguishable from a
// school which has issued no invoices yet, because RLS filters rather than
// raises. If this hook inferred access from the row count it would tell an
// administrator of a new school that they lack access to their own finances, or
// tell a teacher the school has no fees rather than that fees are not theirs to
// see.
//
// So access is decided from the caller's ROLE, which the application already
// knows from their membership, and never from the result. That is the rule
// resourceState.ts encodes, and finance is the clearest case for it.
//
// The role list is migration 13's, not a new one: owner, director and
// administrator. Principal is excluded deliberately and is not an oversight —
// fees have no campus dimension, so a principal's scoped authority cannot be
// expressed on these tables and any access would be school-wide.
// ---------------------------------------------------------------------------

const FINANCE_ROLES = ['owner', 'director', 'administrator'] as const

export interface UseFinanceResult {
  state: ResourceState<FeeRecordView[]>
  records: FeeRecordView[]
  /** True for owner, director and administrator only. Gates every write control. */
  canManageFinance: boolean
  schoolId: string | null
  currency: string
  reload: () => void
}

export function useFinance(): UseFinanceResult {
  const { activeMembership, school, authState } = useAuth()

  const role = activeMembership?.role ?? null
  const canManageFinance = role !== null && (FINANCE_ROLES as readonly string[]).includes(role)
  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const currency = school?.currency ?? 'USD'

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [records, setRecords] = useState<FeeRecordView[]>([])
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false

    if (authState !== 'ready') return
    // Not merely an optimisation. A role without finance access must not issue
    // the query at all, so the screen cannot show a stale or partial figure.
    if (!schoolId || !canManageFinance) {
      setIsLoading(false)
      setRecords([])
      return
    }

    setIsLoading(true)
    setError(null)

    fetchFeeRecords(schoolId, timeZone)
      .then((rows) => {
        if (!cancelled) setRecords(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, canManageFinance, timeZone, authState, nonce])

  const state = deriveResourceState<FeeRecordView[]>({
    isLoading: authState !== 'ready' || isLoading,
    canAccess: authState !== 'ready' ? undefined : schoolId !== null && canManageFinance,
    error,
    data: records,
    retry: reload,
  })

  return { state, records, canManageFinance, schoolId, currency, reload }
}

export interface UseChildFeesResult {
  state: ResourceState<FeeRecordView[]>
  records: FeeRecordView[]
  reload: () => void
}

/**
 * One child's fees for the parent screens. Read-only.
 *
 * There is no write counterpart anywhere in this batch. A guardian holds SELECT
 * and nothing else on both tables.
 */
export function useChildFees(studentId: string | null): UseChildFeesResult {
  const { school, authState } = useAuth()
  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [records, setRecords] = useState<FeeRecordView[]>([])
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false

    if (authState !== 'ready') return
    if (!schoolId || !studentId) {
      setIsLoading(false)
      setRecords([])
      return
    }

    setIsLoading(true)
    setError(null)

    fetchChildFeeRecords(schoolId, studentId, timeZone)
      .then((rows) => {
        if (!cancelled) setRecords(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, studentId, timeZone, authState, nonce])

  const state = deriveResourceState<FeeRecordView[]>({
    isLoading: authState !== 'ready' || isLoading,
    // A child with no fees issued is `empty`, never `denied`. Only the absence
    // of a child or a school denies this.
    canAccess: authState !== 'ready' ? undefined : schoolId !== null && studentId !== null,
    error,
    data: records,
    retry: reload,
  })

  return { state, records, reload }
}

export function useChildrenFees(studentIds: string[]): UseChildFeesResult {
  const { school, authState } = useAuth()
  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const idsKey = Array.from(new Set(studentIds)).sort().join('|')
  const ids = idsKey ? idsKey.split('|') : []

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [records, setRecords] = useState<FeeRecordView[]>([])
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    if (authState !== 'ready') return
    if (!schoolId || ids.length === 0) {
      setIsLoading(false)
      setRecords([])
      return
    }

    setIsLoading(true)
    setError(null)
    Promise.all(ids.map((studentId) => fetchChildFeeRecords(schoolId, studentId, timeZone)))
      .then((rows) => {
        if (!cancelled) setRecords(rows.flat())
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, timeZone, authState, idsKey, nonce])

  const state = deriveResourceState<FeeRecordView[]>({
    isLoading: authState !== 'ready' || isLoading,
    canAccess: authState !== 'ready' ? undefined : schoolId !== null && ids.length > 0,
    error,
    data: records,
    retry: reload,
  })

  return { state, records, reload }
}
