import { subscriptionPlans } from '@/data/subscriptionPlans'

export type FixedPlanCode = 'starter' | 'growth'
export type DemoBillingInterval = 'monthly' | 'annual'
export type DemoPaymentOutcome = 'succeeded' | 'failed' | 'cancelled' | 'pending' | 'rejected'
export type DemoPaymentMethod = 'card' | 'evc-plus' | 'edahab' | 'bank-transfer'

export interface DemoSubscription {
  planCode: FixedPlanCode
  status: 'demo-active'
  startedAt: string
  expiresAt: string
  billingInterval: DemoBillingInterval
  transactionId: string
}

export interface DemoTransaction {
  id: string
  attemptId: string
  reference: string
  planCode: FixedPlanCode
  amount: number
  billingInterval: DemoBillingInterval
  outcome: DemoPaymentOutcome
  createdAt: string
  resolvedAt?: string
  paymentMethod?: DemoPaymentMethod
  transferReference?: string
}

export interface DemoBillingState {
  version: 2
  schoolId: string
  subscription: DemoSubscription | null
  transactions: DemoTransaction[]
}

const STORAGE_KEY_PREFIX = 'nomcloud:subscription-demo:v2:'
const LEGACY_STORAGE_KEY_PREFIX = 'nomcloud:subscription-demo:v1:'

function storageKey(schoolId: string, version = 2) {
  const prefix = version === 1 ? LEGACY_STORAGE_KEY_PREFIX : STORAGE_KEY_PREFIX
  return `${prefix}${encodeURIComponent(schoolId)}`
}

function emptyState(schoolId: string): DemoBillingState {
  return { version: 2, schoolId, subscription: null, transactions: [] }
}

function fixedPlanPrice(planCode: FixedPlanCode) {
  const plan = subscriptionPlans.find((candidate) => candidate.code === planCode)
  if (!plan || plan.monthlyPrice === null) throw new Error('The selected demo plan is unavailable.')
  return plan.monthlyPrice
}

function amountFor(planCode: FixedPlanCode, billingInterval: DemoBillingInterval) {
  return fixedPlanPrice(planCode) * (billingInterval === 'annual' ? 12 : 1)
}

function isFixedPlanCode(value: unknown): value is FixedPlanCode {
  return value === 'starter' || value === 'growth'
}

function isBillingInterval(value: unknown): value is DemoBillingInterval {
  return value === 'monthly' || value === 'annual'
}

function isDemoPaymentMethod(value: unknown): value is DemoPaymentMethod {
  return value === 'card' || value === 'evc-plus' || value === 'edahab' || value === 'bank-transfer'
}

function isDemoPaymentOutcome(value: unknown): value is DemoPaymentOutcome {
  return value === 'succeeded' || value === 'failed' || value === 'cancelled' ||
    value === 'pending' || value === 'rejected'
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isValidV2State(value: unknown, schoolId: string): value is DemoBillingState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<DemoBillingState>
  if (candidate.version !== 2 || candidate.schoolId !== schoolId || !Array.isArray(candidate.transactions)) return false

  const transactionIds = new Set<string>()
  const attemptIds = new Set<string>()
  for (const transaction of candidate.transactions) {
    if (
      typeof transaction !== 'object' || transaction === null ||
      typeof transaction.id !== 'string' || typeof transaction.attemptId !== 'string' ||
      typeof transaction.reference !== 'string' || !transaction.reference.startsWith('DEMO-') ||
      !isFixedPlanCode(transaction.planCode) || !isBillingInterval(transaction.billingInterval) ||
      transaction.amount !== amountFor(transaction.planCode, transaction.billingInterval) ||
      !isDemoPaymentOutcome(transaction.outcome) ||
      (transaction.paymentMethod !== undefined && !isDemoPaymentMethod(transaction.paymentMethod)) ||
      (transaction.transferReference !== undefined && typeof transaction.transferReference !== 'string') ||
      !isValidTimestamp(transaction.createdAt) ||
      (transaction.resolvedAt !== undefined && !isValidTimestamp(transaction.resolvedAt)) ||
      transactionIds.has(transaction.id) || attemptIds.has(transaction.attemptId) ||
      (transaction.outcome === 'pending' && transaction.paymentMethod !== 'bank-transfer') ||
      (transaction.outcome === 'rejected' && transaction.paymentMethod !== 'bank-transfer')
    ) return false
    transactionIds.add(transaction.id)
    attemptIds.add(transaction.attemptId)
  }

  const subscription = candidate.subscription
  if (subscription === null) return true
  if (
    typeof subscription !== 'object' || !isFixedPlanCode(subscription.planCode) ||
    subscription.status !== 'demo-active' || !isBillingInterval(subscription.billingInterval) ||
    !isValidTimestamp(subscription.startedAt) || !isValidTimestamp(subscription.expiresAt)
  ) return false

  return candidate.transactions.some((transaction) =>
    transaction.id === subscription.transactionId &&
    transaction.outcome === 'succeeded' &&
    transaction.planCode === subscription.planCode &&
    transaction.billingInterval === subscription.billingInterval,
  )
}

function migrateV1State(value: unknown, schoolId: string): DemoBillingState | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as {
    version?: unknown
    schoolId?: unknown
    subscription?: unknown
    transactions?: unknown
  }
  if (candidate.version !== 1 || candidate.schoolId !== schoolId || !Array.isArray(candidate.transactions)) return null

  const transactions: DemoTransaction[] = []
  for (const entry of candidate.transactions) {
    if (typeof entry !== 'object' || entry === null) return null
    const old = entry as Record<string, unknown>
    const hasLegacyPaymentMethod = old.paymentMethod === undefined || old.paymentMethod === 'card' ||
      old.paymentMethod === 'mobile-money' || old.paymentMethod === 'ussd' || old.paymentMethod === 'bank-agent'
    if (
      typeof old.id !== 'string' || typeof old.attemptId !== 'string' ||
      typeof old.reference !== 'string' || !old.reference.startsWith('DEMO-') ||
      !isFixedPlanCode(old.planCode) || !isValidTimestamp(old.createdAt) ||
      old.amount !== fixedPlanPrice(old.planCode) || !hasLegacyPaymentMethod ||
      (old.outcome !== 'succeeded' && old.outcome !== 'failed')
    ) return null
    const paymentMethod = old.paymentMethod === 'card' || old.paymentMethod === 'mobile-money' ||
      old.paymentMethod === 'ussd' || old.paymentMethod === 'bank-agent'
      ? old.paymentMethod : undefined
    transactions.push({
      id: old.id,
      attemptId: old.attemptId,
      reference: old.reference,
      planCode: old.planCode,
      amount: fixedPlanPrice(old.planCode),
      billingInterval: 'monthly',
      outcome: old.outcome,
      createdAt: old.createdAt,
      paymentMethod: paymentMethod === 'mobile-money' ? 'evc-plus'
        : paymentMethod === 'bank-agent' ? 'bank-transfer'
          : paymentMethod === 'ussd' ? undefined : paymentMethod,
    })
  }

  let subscription: DemoSubscription | null = null
  if (candidate.subscription !== null) {
    if (typeof candidate.subscription !== 'object') return null
    const oldSubscription = candidate.subscription as Record<string, unknown>
    if (
      !isFixedPlanCode(oldSubscription.planCode) ||
      oldSubscription.status !== 'demo-active' ||
      !isValidTimestamp(oldSubscription.startedAt) ||
      typeof oldSubscription.transactionId !== 'string'
    ) return null
    const transaction = transactions.find((item) =>
      item.id === oldSubscription.transactionId && item.outcome === 'succeeded' &&
      item.planCode === oldSubscription.planCode,
    )
    if (!transaction) return null
    const expiresAt = new Date(Date.parse(oldSubscription.startedAt) + 30 * 24 * 60 * 60 * 1000).toISOString()
    subscription = {
      planCode: oldSubscription.planCode,
      status: 'demo-active',
      startedAt: oldSubscription.startedAt,
      expiresAt,
      billingInterval: 'monthly',
      transactionId: oldSubscription.transactionId,
    }
  }

  const migrated = { version: 2 as const, schoolId, subscription, transactions }
  return isValidV2State(migrated, schoolId) ? migrated : null
}

function assertBrowserDemo() {
  if (typeof window === 'undefined') throw new Error('Browser demo billing requires a browser environment.')
}

export function createDemoAttemptId() {
  assertBrowserDemo()
  return crypto.randomUUID()
}

export function loadDemoBillingState(schoolId: string): DemoBillingState {
  assertBrowserDemo()
  if (!schoolId) throw new Error('A school is required to load demo billing data.')

  const key = storageKey(schoolId)
  const raw = window.localStorage.getItem(key)
  if (raw !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Stored demo billing data is invalid. Clear this school’s demo billing storage to continue.')
    }
    if (!isValidV2State(parsed, schoolId)) {
      throw new Error('Stored demo billing data is invalid or belongs to a different school.')
    }
    return parsed
  }

  const legacyRaw = window.localStorage.getItem(storageKey(schoolId, 1))
  if (legacyRaw === null) return emptyState(schoolId)
  let legacy: unknown
  try {
    legacy = JSON.parse(legacyRaw)
  } catch {
    throw new Error('Stored demo billing data is invalid. Clear this school’s demo billing storage to continue.')
  }
  const migrated = migrateV1State(legacy, schoolId)
  if (!migrated) throw new Error('Stored demo billing data is invalid or belongs to a different school.')
  window.localStorage.setItem(key, JSON.stringify(migrated))
  return migrated
}

export function recordDemoPayment(
  schoolId: string,
  attemptId: string,
  planCode: FixedPlanCode,
  billingInterval: DemoBillingInterval,
  outcome: DemoPaymentOutcome,
  paymentMethod: DemoPaymentMethod,
  transferReference?: string,
): DemoBillingState {
  assertBrowserDemo()
  if (!schoolId || !attemptId) throw new Error('A school and checkout attempt are required.')
  if (!isFixedPlanCode(planCode) || !isBillingInterval(billingInterval)) throw new Error('The selected demo plan is unavailable.')
  if (!isDemoPaymentMethod(paymentMethod)) throw new Error('The selected demo payment method is unavailable.')
  if (!isDemoPaymentOutcome(outcome)) throw new Error('The selected demo outcome is unavailable.')
  if ((outcome === 'pending' || outcome === 'rejected') && paymentMethod !== 'bank-transfer') {
    throw new Error('Only bank transfer demo attempts can require verification.')
  }
  if (outcome === 'pending' && (transferReference ?? '').trim().length < 3) {
    throw new Error('A bank transfer reference is required before demo verification.')
  }
  if (paymentMethod === 'bank-transfer' && outcome === 'succeeded') {
    throw new Error('A bank transfer can only be marked successful after a separate verification action.')
  }

  const state = loadDemoBillingState(schoolId)
  const existingAttempt = state.transactions.find((transaction) => transaction.attemptId === attemptId)
  if (existingAttempt) return state

  const createdAt = new Date().toISOString()
  const transaction: DemoTransaction = {
    id: crypto.randomUUID(),
    attemptId,
    reference: `DEMO-${crypto.randomUUID().toUpperCase()}`,
    planCode,
    amount: amountFor(planCode, billingInterval),
    billingInterval,
    outcome,
    createdAt,
    paymentMethod,
    ...(transferReference ? { transferReference } : {}),
  }
  const durationDays = billingInterval === 'annual' ? 365 : 30
  const nextState: DemoBillingState = {
    ...state,
    subscription: outcome === 'succeeded'
      ? {
          planCode,
          status: 'demo-active',
          startedAt: createdAt,
          expiresAt: new Date(Date.parse(createdAt) + durationDays * 24 * 60 * 60 * 1000).toISOString(),
          billingInterval,
          transactionId: transaction.id,
        }
      : state.subscription,
    transactions: [transaction, ...state.transactions],
  }

  window.localStorage.setItem(storageKey(schoolId), JSON.stringify(nextState))
  return nextState
}

export function resolveDemoBankTransfer(
  schoolId: string,
  transactionId: string,
  outcome: 'succeeded' | 'rejected',
): DemoBillingState {
  assertBrowserDemo()
  if (!schoolId || !transactionId) throw new Error('A school and transfer record are required.')
  const state = loadDemoBillingState(schoolId)
  const transaction = state.transactions.find((item) => item.id === transactionId)
  if (!transaction || transaction.paymentMethod !== 'bank-transfer' || transaction.outcome !== 'pending') {
    throw new Error('This bank transfer is not awaiting demo verification.')
  }
  const resolvedAt = new Date().toISOString()
  const updatedTransaction = { ...transaction, outcome, resolvedAt }
  const nextState: DemoBillingState = {
    ...state,
    subscription: outcome === 'succeeded'
      ? {
          planCode: transaction.planCode,
          status: 'demo-active',
          startedAt: resolvedAt,
          expiresAt: new Date(Date.parse(resolvedAt) + (transaction.billingInterval === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
          billingInterval: transaction.billingInterval,
          transactionId: transaction.id,
        }
      : state.subscription,
    transactions: state.transactions.map((item) =>
      item.id === transactionId ? updatedTransaction : item,
    ),
  }
  window.localStorage.setItem(storageKey(schoolId), JSON.stringify(nextState))
  return nextState
}
