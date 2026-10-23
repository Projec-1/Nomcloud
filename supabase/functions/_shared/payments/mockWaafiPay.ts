// ---------------------------------------------------------------------------
// MockWaafiPay — simulates PreAuthorize -> PIN approval -> Commit, offline.
//
// No network, no Deno APIs, no stored state: it can be tested with `deno test`
// and runs identically inside an Edge Function.
//
// SCENARIOS ARE CHOSEN BY THE TEST ACCOUNT NUMBER'S LAST FOUR DIGITS.
//
//   ...0001  APPROVE    PreAuthorize -> pending,   Commit -> approved
//   ...0002  DECLINE    PreAuthorize -> declined   (wrong PIN / no funds)
//   ...0003  TIMEOUT    PreAuthorize -> pending,   Commit -> cancelled
//   ...0004  DUPLICATE  PreAuthorize -> pending,   Commit -> approved, and the
//                       same approval again on every later Commit, so settling
//                       twice simulates WaafiPay delivering one success twice
//   anything else       PreAuthorize -> declined   (never approve by accident)
//
// Edge Functions are stateless, so the scenario is encoded in the transaction
// id PreAuthorize returns ("MOCK-APPROVE-<uuid>"), and Commit reads it back.
//
// THE MOCK DOES NOT DECIDE WHERE MONEY MAY GO. The hard rule that mock payments
// only touch schools with is_demo = true is enforced in access.ts before the
// adapter is called, and again inside apply_payment_event.
//
// The raw payload imitates a WaafiPay-style envelope so stored events look
// realistic. ITS SHAPE IS ASSUMED, not taken from WaafiPay documentation.
// ---------------------------------------------------------------------------

import type { PaymentMethod, PaymentProvider, PreAuthorizeRequest, ProviderResult, PurchaseResult } from './provider.ts'

export type MockScenario = 'APPROVE' | 'DECLINE' | 'TIMEOUT' | 'DUPLICATE'

const SCENARIO_BY_SUFFIX: Record<string, MockScenario> = {
  '0001': 'APPROVE',
  '0002': 'DECLINE',
  '0003': 'TIMEOUT',
  '0004': 'DUPLICATE',
}

export function scenarioForAccount(accountNo: string): MockScenario {
  const digits = accountNo.replace(/\D/g, '')
  return SCENARIO_BY_SUFFIX[digits.slice(-4)] ?? 'DECLINE'
}

export function scenarioFromTransactionId(transactionId: string): MockScenario | null {
  const match = /^MOCK-(APPROVE|DECLINE|TIMEOUT|DUPLICATE)-[0-9a-f-]{36}$/i.exec(transactionId)
  return match ? (match[1].toUpperCase() as MockScenario) : null
}

function envelope(state: string, transactionId: string, extra: Record<string, unknown>) {
  return {
    mock: true,
    schemaVersion: 'assumed-1',
    responseCode: state === 'APPROVED' || state === 'PENDING' ? '2001' : '5206',
    responseMsg: state === 'APPROVED' || state === 'PENDING' ? 'RCS_SUCCESS' : 'RCS_TRAN_FAILED',
    params: { state, transactionId, ...extra },
  }
}

export class MockWaafiPay implements PaymentProvider {
  readonly name = 'waafipay' as const
  readonly isMock = true

  purchase(req: PreAuthorizeRequest & { invoiceId: string }): Promise<PurchaseResult> {
    const scenario = scenarioForAccount(req.accountNo)
    const eventType = scenario === 'APPROVE' || scenario === 'DUPLICATE'
      ? 'approved'
      : scenario === 'TIMEOUT'
        ? 'pending'
        : 'declined'
    const transactionId = `MOCK-${scenario}-${crypto.randomUUID()}`
    const responseId = `MOCK-RESPONSE-${crypto.randomUUID()}`

    return Promise.resolve({
      transactionId: eventType === 'declined' ? null : transactionId,
      responseId,
      referenceId: req.referenceId,
      eventType,
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: envelope(eventType === 'approved' ? 'APPROVED' : eventType.toUpperCase(), transactionId, {
        referenceId: req.referenceId,
        invoiceId: req.invoiceId,
        accountNo: req.accountNo,
        amount: req.amount,
        currency: req.currency,
        method: req.method,
        service: 'API_PURCHASE',
      }),
    })
  }

  preAuthorize(req: PreAuthorizeRequest): Promise<ProviderResult> {
    const scenario = scenarioForAccount(req.accountNo)
    const transactionId = `MOCK-${scenario}-${crypto.randomUUID()}`
    const eventType = scenario === 'DECLINE' ? 'declined' : 'pending'

    return Promise.resolve({
      transactionId,
      eventType,
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: envelope(eventType === 'pending' ? 'PENDING' : 'DECLINED', transactionId, {
        referenceId: req.referenceId,
        accountNo: req.accountNo,
        amount: req.amount,
        currency: req.currency,
        method: req.method,
        service: 'API_PREAUTHORIZE',
      }),
    })
  }

  commit(req: { transactionId: string; amount: number; currency: string; method: PaymentMethod }): Promise<ProviderResult> {
    const scenario = scenarioFromTransactionId(req.transactionId)
    if (!scenario) return Promise.reject(new Error('Unknown mock transaction id'))

    const eventType =
      scenario === 'APPROVE' || scenario === 'DUPLICATE' ? 'approved' : scenario === 'TIMEOUT' ? 'cancelled' : 'declined'

    return Promise.resolve({
      transactionId: req.transactionId,
      eventType,
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: envelope(eventType.toUpperCase(), req.transactionId, {
        amount: req.amount,
        currency: req.currency,
        method: req.method,
        service: 'API_PREAUTHORIZE_COMMIT',
      }),
    })
  }

  cancel(req: { transactionId: string; amount: number; currency: string; method: PaymentMethod }): Promise<ProviderResult> {
    if (!scenarioFromTransactionId(req.transactionId)) {
      return Promise.reject(new Error('Unknown mock transaction id'))
    }
    return Promise.resolve({
      transactionId: req.transactionId,
      eventType: 'cancelled',
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: envelope('CANCELLED', req.transactionId, { service: 'API_PREAUTHORIZE_CANCEL' }),
    })
  }
}
