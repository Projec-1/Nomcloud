import type {
  PaymentMethod,
  PaymentProvider,
  PreAuthorizeRequest,
  ProviderResult,
  PurchaseResult,
} from './provider.ts'

export interface WaafiPayConfig {
  merchantUid: string
  apiUserId: string
  apiKey: string
  baseUrl: string
}

interface WaafiResponse {
  responseCode?: unknown
  errorCode?: unknown
  responseMsg?: unknown
  responseId?: unknown
  params?: unknown
}

type WaafiState = 'pending' | 'approved' | 'declined' | 'cancelled' | 'unknown'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function amount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function providerState(response: WaafiResponse): WaafiState {
  const params = record(response.params)
  const state = text(params.state)?.toUpperCase()
  if (String(response.responseCode) !== '2001' || String(response.errorCode ?? '0') !== '0') {
    return 'unknown'
  }
  if (state === 'APPROVED') return 'approved'
  if (state === 'PENDING') return 'pending'
  if (state === 'DECLINED' || state === 'REJECTED' || state === 'FAILED') return 'declined'
  if (state === 'CANCELLED' || state === 'CANCELED') return 'cancelled'
  return 'unknown'
}

function requestTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

function assertMobileWallet(method: PaymentMethod) {
  if (method !== 'mobile_money') {
    throw new Error(`WaafiPay ${method} checkout is not configured; use mobile money`)
  }
}

export class WaafiPayHttp implements PaymentProvider {
  readonly name = 'waafipay' as const
  readonly isMock = false
  private readonly endpoint: string
  private readonly config: WaafiPayConfig

  constructor(config: WaafiPayConfig) {
    this.config = config
    const endpoint = new URL(config.baseUrl)
    if (endpoint.protocol !== 'https:' || endpoint.href !== 'https://sandbox.waafipay.com/asm') {
      throw new Error('Only the WaafiPay sandbox endpoint is enabled for this release candidate')
    }
    this.endpoint = endpoint.href
  }

  async purchase(req: PreAuthorizeRequest & { invoiceId: string }): Promise<PurchaseResult> {
    assertMobileWallet(req.method)
    const response = await this.call('API_PURCHASE', {
      paymentMethod: 'MWALLET_ACCOUNT',
      payerInfo: { accountNo: this.accountNumber(req.accountNo) },
      transactionInfo: {
        referenceId: req.referenceId,
        invoiceId: req.invoiceId,
        amount: req.amount.toFixed(2),
        currency: req.currency,
        description: 'Nom Cloud school subscription',
      },
    })
    const params = record(response.params)
    const eventType = providerState(response)
    const returnedReference = text(params.referenceId)
    const returnedAmount = amount(params.txAmount ?? params.amount)
    const returnedCurrency = text(params.currency) ?? req.currency

    return {
      transactionId: text(params.transactionId),
      responseId: text(response.responseId),
      referenceId: returnedReference,
      eventType,
      amount: returnedAmount,
      currency: returnedCurrency,
      method: req.method,
      raw: response,
    }
  }

  async preAuthorize(req: PreAuthorizeRequest): Promise<ProviderResult> {
    assertMobileWallet(req.method)
    const response = await this.call('API_PREAUTHORIZE', {
      paymentMethod: 'MWALLET_ACCOUNT',
      payerInfo: { accountNo: this.accountNumber(req.accountNo) },
      transactionInfo: {
        referenceId: req.referenceId,
        amount: req.amount.toFixed(2),
        currency: req.currency,
        description: 'Nom Cloud student fee',
      },
    })
    const params = record(response.params)
    const eventType = providerState(response)
    const transactionId = text(params.transactionId)
    const returnedReference = text(params.referenceId)
    const returnedAmount = amount(params.txAmount ?? params.amount)
    const returnedCurrency = text(params.currency)

    if (
      eventType === 'unknown' ||
      !transactionId ||
      returnedReference !== req.referenceId ||
      returnedAmount === null ||
      Math.round(returnedAmount * 100) !== Math.round(req.amount * 100) ||
      (returnedCurrency !== null && returnedCurrency.toUpperCase() !== req.currency.toUpperCase())
    ) {
      throw new Error('WaafiPay did not return a verifiable preauthorization result')
    }

    return {
      transactionId,
      eventType: eventType === 'approved' ? 'pending' : eventType,
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: response,
    }
  }

  async commit(req: { transactionId: string; amount: number; currency: string; method: PaymentMethod }): Promise<ProviderResult> {
    assertMobileWallet(req.method)
    const response = await this.call('API_PREAUTHORIZE_COMMIT', {
      transactionId: req.transactionId,
      description: 'Nom Cloud student fee',
    })
    const params = record(response.params)
    const eventType = providerState(response)
    const returnedTransactionId = text(params.transactionId)
    if (eventType === 'unknown' || (returnedTransactionId && returnedTransactionId !== req.transactionId)) {
      throw new Error('WaafiPay did not return a verifiable payment commitment')
    }

    return {
      transactionId: req.transactionId,
      eventType,
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: response,
    }
  }

  async cancel(req: { transactionId: string; amount: number; currency: string; method: PaymentMethod }): Promise<ProviderResult> {
    assertMobileWallet(req.method)
    const response = await this.call('API_PREAUTHORIZE_CANCEL', {
      transactionId: req.transactionId,
      description: 'Nom Cloud student fee cancelled',
    })
    const params = record(response.params)
    const eventType = providerState(response)
    const returnedTransactionId = text(params.transactionId)
    if (eventType === 'unknown' || (returnedTransactionId && returnedTransactionId !== req.transactionId)) {
      throw new Error('WaafiPay did not return a verifiable cancellation result')
    }

    return {
      transactionId: req.transactionId,
      eventType,
      amount: req.amount,
      currency: req.currency,
      method: req.method,
      raw: response,
    }
  }

  private accountNumber(value: string) {
    const digits = value.replace(/\D/g, '')
    if (!/^\d{10,20}$/.test(digits)) {
      throw new Error('A full international mobile number is required for WaafiPay')
    }
    return digits
  }

  private async call(serviceName: string, serviceParams: Record<string, unknown>): Promise<WaafiResponse> {
    const request = {
      schemaVersion: '1.0',
      requestId: crypto.randomUUID(),
      timestamp: requestTimestamp(),
      channelName: 'WEB',
      serviceName,
      serviceParams: {
        merchantUid: this.config.merchantUid,
        apiUserId: this.config.apiUserId,
        apiKey: this.config.apiKey,
        ...serviceParams,
      },
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`WaafiPay request failed with HTTP ${response.status}`)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('WaafiPay returned an unreadable response')
    }
    const result = record(body) as WaafiResponse
    if (!result.responseCode || !result.params) {
      throw new Error('WaafiPay returned an incomplete response')
    }
    return result
  }
}
