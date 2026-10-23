// Student-fee and subscription payments share this provider interface but
// retain separate authorization, invoice ownership, and database ledgers.

import { MockWaafiPay } from './mockWaafiPay.ts'
import { WaafiPayHttp } from './waafiPayHttp.ts'

/** The four channels decision 4 fixed; matches payment_events_payment_method_check. */
export type PaymentMethod = 'mobile_money' | 'card' | 'ussd' | 'bank_agent'

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['mobile_money', 'card', 'ussd', 'bank_agent']

/** What the provider said. Matches payment_events_event_type_check. */
export type ProviderEventType = 'pending' | 'approved' | 'declined' | 'cancelled'

export interface PreAuthorizeRequest {
  /** Our own reference for this attempt, echoed back by the provider. */
  referenceId: string
  amount: number
  currency: string
  method: PaymentMethod
  /** The payer's wallet or account number, e.g. a mobile money number. */
  accountNo: string
}

export interface ProviderResult {
  /** The provider's transaction id. Becomes payment_events.provider_event_id. */
  transactionId: string
  eventType: ProviderEventType
  amount: number
  currency: string
  method: PaymentMethod
  /** Stored verbatim as payment_events.raw_payload. */
  raw: unknown
}

export interface PurchaseResult {
  transactionId: string | null
  responseId: string | null
  referenceId: string | null
  eventType: 'pending' | 'approved' | 'declined' | 'cancelled' | 'unknown'
  amount: number | null
  currency: string
  method: PaymentMethod
  raw: unknown
}

export interface PaymentProvider {
  /** The value written to payment_events.provider. */
  readonly name: 'waafipay'
  /** True for the mock; each billing flow independently restricts it to demo schools. */
  readonly isMock: boolean
  /** Charge immediately for a platform invoice, without sharing the student-fee ledger. */
  purchase(req: PreAuthorizeRequest & { invoiceId: string }): Promise<PurchaseResult>
  preAuthorize(req: PreAuthorizeRequest): Promise<ProviderResult>
  /** Ask for the final outcome and capture the money if approved. */
  commit(req: { transactionId: string; amount: number; currency: string; method: PaymentMethod }): Promise<ProviderResult>
  cancel(req: { transactionId: string; amount: number; currency: string; method: PaymentMethod }): Promise<ProviderResult>
}

export type ProviderMode = 'mock' | 'live'

/**
 * The mode. MOCK UNLESS EXPLICITLY SET TO live.
 *
 * No secret is needed for mock mode, so a project with no WaafiPay credentials
 * can only ever run the mock, and the mock can only ever touch the demo school.
 */
export function providerMode(): ProviderMode {
  return Deno.env.get('WAAFIPAY_MODE') === 'live' ? 'live' : 'mock'
}

export function getPaymentProvider(): PaymentProvider {
  if (providerMode() === 'mock') return new MockWaafiPay()

  const merchantUid = Deno.env.get('WAAFIPAY_MERCHANT_UID')
  const apiUserId = Deno.env.get('WAAFIPAY_API_USER_ID')
  const apiKey = Deno.env.get('WAAFIPAY_API_KEY')
  const baseUrl = Deno.env.get('WAAFIPAY_BASE_URL')
  if (!merchantUid || !apiUserId || !apiKey || !baseUrl) {
    // Live mode without credentials must fail closed, never fall back to mock.
    throw new Error('WAAFIPAY_MODE is live but WaafiPay credentials are not configured')
  }
  return new WaafiPayHttp({ merchantUid, apiUserId, apiKey, baseUrl })
}
