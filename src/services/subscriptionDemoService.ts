import { subscriptionPlans } from '@/data/subscriptionPlans'

export type FixedPlanCode = 'starter' | 'growth'
export type DemoPaymentOutcome = 'succeeded' | 'failed'
export type DemoPaymentMethod = 'mobile-money' | 'card' | 'ussd' | 'bank-agent'

export interface DemoSubscription {
  planCode: FixedPlanCode
  status: 'demo-active'
  startedAt: string
  transactionId: string
}

export interface DemoTransaction {
  id: string
  attemptId: string
  reference: string
  planCode: FixedPlanCode
  amount: number
  outcome: DemoPaymentOutcome
  createdAt: string
  paymentMethod?: DemoPaymentMethod
}

export interface DemoBillingState {
  version: 1
  schoolId: string
  subscription: DemoSubscription | null
  transactions: DemoTransaction[]
}

const STORAGE_KEY_PREFIX = 'nomcloud:subscription-demo:v1:'

function storageKey(schoolId: string) {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(schoolId)}`
}

function emptyState(schoolId: string): DemoBillingState {
  return { version: 1, schoolId, subscription: null, transactions: [] }
}

function fixedPlanPrice(planCode: FixedPlanCode) {
  const plan = subscriptionPlans.find((candidate) => candidate.code === planCode)
  if (!plan || plan.monthlyPrice === null) throw new Error('The selected demo plan is unavailable.')
  return plan.monthlyPrice
}

function isFixedPlanCode(value: unknown): value is FixedPlanCode {
  return value === 'starter' || value === 'growth'
}

function isDemoPaymentMethod(value: unknown): value is DemoPaymentMethod {
  return value === 'mobile-money' || value === 'card' || value === 'ussd' || value === 'bank-agent'
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isDemoBillingState(value: unknown, schoolId: string): value is DemoBillingState {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<DemoBillingState>
  if (
    candidate.version !== 1 ||
    candidate.schoolId !== schoolId ||
    !Array.isArray(candidate.transactions)
  ) {
    return false
  }

  const transactions = candidate.transactions
  const transactionIds = new Set<string>()
  const attemptIds = new Set<string>()

  for (const transaction of transactions) {
    if (
      typeof transaction !== 'object' ||
      transaction === null ||
      typeof transaction.id !== 'string' ||
      typeof transaction.attemptId !== 'string' ||
      typeof transaction.reference !== 'string' ||
      !transaction.reference.startsWith('DEMO-') ||
      !isFixedPlanCode(transaction.planCode) ||
      transaction.amount !== fixedPlanPrice(transaction.planCode) ||
      (transaction.outcome !== 'succeeded' && transaction.outcome !== 'failed') ||
      (transaction.paymentMethod !== undefined && !isDemoPaymentMethod(transaction.paymentMethod)) ||
      !isValidTimestamp(transaction.createdAt) ||
      transactionIds.has(transaction.id) ||
      attemptIds.has(transaction.attemptId)
    ) {
      return false
    }
    transactionIds.add(transaction.id)
    attemptIds.add(transaction.attemptId)
  }

  const subscription = candidate.subscription
  if (subscription === null) return true
  if (
    typeof subscription !== 'object' ||
    !isFixedPlanCode(subscription.planCode) ||
    subscription.status !== 'demo-active' ||
    !isValidTimestamp(subscription.startedAt)
  ) {
    return false
  }

  return transactions.some(
    (transaction) =>
      transaction.id === subscription.transactionId &&
      transaction.outcome === 'succeeded' &&
      transaction.planCode === subscription.planCode,
  )
}

function assertDevelopmentDemo() {
  if (!import.meta.env.DEV) {
    throw new Error('Demo subscription storage is available only in development builds.')
  }
}

export function createDemoAttemptId() {
  assertDevelopmentDemo()
  return crypto.randomUUID()
}

export function loadDemoBillingState(schoolId: string): DemoBillingState {
  assertDevelopmentDemo()
  if (!schoolId) throw new Error('A school is required to load demo billing data.')

  const raw = window.localStorage.getItem(storageKey(schoolId))
  if (raw === null) return emptyState(schoolId)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Stored demo billing data is invalid. Clear this school’s demo billing storage to continue.')
  }

  if (!isDemoBillingState(parsed, schoolId)) {
    throw new Error('Stored demo billing data is invalid or belongs to a different school.')
  }
  return parsed
}

export function recordDemoPayment(
  schoolId: string,
  attemptId: string,
  planCode: FixedPlanCode,
  outcome: DemoPaymentOutcome,
  paymentMethod: DemoPaymentMethod,
): DemoBillingState {
  assertDevelopmentDemo()
  if (!schoolId || !attemptId) throw new Error('A school and checkout attempt are required.')
  if (!isDemoPaymentMethod(paymentMethod)) throw new Error('The selected demo payment method is unavailable.')

  const state = loadDemoBillingState(schoolId)
  const existingAttempt = state.transactions.find((transaction) => transaction.attemptId === attemptId)
  if (existingAttempt) return state

  const transaction: DemoTransaction = {
    id: crypto.randomUUID(),
    attemptId,
    reference: `DEMO-${crypto.randomUUID().toUpperCase()}`,
    planCode,
    amount: fixedPlanPrice(planCode),
    outcome,
    createdAt: new Date().toISOString(),
    paymentMethod,
  }

  const nextState: DemoBillingState = {
    ...state,
    subscription:
      outcome === 'succeeded'
        ? {
            planCode,
            status: 'demo-active',
            startedAt: transaction.createdAt,
            transactionId: transaction.id,
          }
        : state.subscription,
    transactions: [transaction, ...state.transactions],
  }

  window.localStorage.setItem(storageKey(schoolId), JSON.stringify(nextState))
  return nextState
}
