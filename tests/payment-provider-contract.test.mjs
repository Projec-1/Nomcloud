import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WaafiPayHttp } from '../supabase/functions/_shared/payments/waafiPayHttp.ts'

const config = {
  merchantUid: 'merchant-test',
  apiUserId: 'api-user-test',
  apiKey: 'api-key-test',
  baseUrl: 'https://sandbox.waafipay.com/asm',
}

function mockWaafiResponse(params, responseCode = '2001', responseId = 'response-001') {
  return new Response(JSON.stringify({
    responseCode,
    errorCode: responseCode === '2001' ? '0' : '1',
    responseId,
    params,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('subscription purchase sends only a sandbox wallet request and maps exact provider evidence', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init }
    return mockWaafiResponse({
      state: 'APPROVED',
      transactionId: 'waafi-transaction-001',
      referenceId: 'NC60000000000040008000000000000001',
      txAmount: '60.00',
      currency: 'USD',
    })
  }

  try {
    const result = await new WaafiPayHttp(config).purchase({
      referenceId: 'NC60000000000040008000000000000001',
      invoiceId: 'SUB-001',
      amount: 60,
      currency: 'USD',
      method: 'mobile_money',
      accountNo: '+252 61 234 5678',
    })

    assert.equal(request.url, config.baseUrl)
    const body = JSON.parse(request.init.body)
    assert.equal(body.serviceName, 'API_PURCHASE')
    assert.equal(body.serviceParams.paymentMethod, 'MWALLET_ACCOUNT')
    assert.equal(body.serviceParams.payerInfo.accountNo, '252612345678')
    assert.equal(body.serviceParams.transactionInfo.invoiceId, 'SUB-001')
    assert.equal(result.eventType, 'approved')
    assert.equal(result.transactionId, 'waafi-transaction-001')
    assert.equal(result.responseId, 'response-001')
    assert.equal(result.referenceId, 'NC60000000000040008000000000000001')
    assert.equal(result.amount, 60)
    assert.equal(result.currency, 'USD')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('purchase keeps pending and unrecognized provider outcomes non-successful', async () => {
  const originalFetch = globalThis.fetch
  let state = 'PENDING'
  globalThis.fetch = async () => mockWaafiResponse({
    state,
    transactionId: 'waafi-transaction-002',
    referenceId: 'NC-002',
    txAmount: '60.00',
  })

  try {
    const provider = new WaafiPayHttp(config)
    const request = {
      referenceId: 'NC-002',
      invoiceId: 'SUB-002',
      amount: 60,
      currency: 'USD',
      method: 'mobile_money',
      accountNo: '252612345678',
    }
    assert.equal((await provider.purchase(request)).eventType, 'pending')

    state = 'PROCESSING'
    assert.equal((await provider.purchase(request)).eventType, 'unknown')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fee preauthorization requires matching provider reference and amount', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = JSON.parse(init.body)
    assert.equal(String(input), config.baseUrl)
    assert.equal(request.serviceName, 'API_PREAUTHORIZE')
    return mockWaafiResponse({
      state: 'APPROVED',
      transactionId: 'waafi-fee-001',
      referenceId: 'fee-reference-001',
      txAmount: '25.50',
    })
  }

  try {
    const result = await new WaafiPayHttp(config).preAuthorize({
      referenceId: 'fee-reference-001',
      amount: 25.5,
      currency: 'USD',
      method: 'mobile_money',
      accountNo: '252612345678',
    })
    assert.equal(result.eventType, 'pending')
    assert.equal(result.transactionId, 'waafi-fee-001')
    assert.equal(result.amount, 25.5)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fee preauthorization rejects missing or mismatched provider amount evidence', async () => {
  const originalFetch = globalThis.fetch
  let responseParams = {
    state: 'APPROVED',
    transactionId: 'waafi-fee-002',
    referenceId: 'fee-reference-002',
  }
  globalThis.fetch = async () => mockWaafiResponse(responseParams)

  try {
    const provider = new WaafiPayHttp(config)
    const request = {
      referenceId: 'fee-reference-002',
      amount: 25.5,
      currency: 'USD',
      method: 'mobile_money',
      accountNo: '252612345678',
    }
    await assert.rejects(provider.preAuthorize(request), /verifiable preauthorization result/)

    responseParams = { ...responseParams, txAmount: '24.50' }
    await assert.rejects(provider.preAuthorize(request), /verifiable preauthorization result/)

    responseParams = { ...responseParams, txAmount: '25.50', currency: 'SOS' }
    await assert.rejects(provider.preAuthorize(request), /verifiable preauthorization result/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('the HTTP adapter refuses production and unsupported wallet methods', async () => {
  assert.throws(
    () => new WaafiPayHttp({ ...config, baseUrl: 'https://api.waafipay.net/asm' }),
    /Only the WaafiPay sandbox endpoint is enabled/,
  )

  const provider = new WaafiPayHttp(config)
  await assert.rejects(
    provider.purchase({
      referenceId: 'NC-003',
      invoiceId: 'SUB-003',
      amount: 60,
      currency: 'USD',
      method: 'card',
      accountNo: '252612345678',
    }),
    /checkout is not configured/,
  )
})
