import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sendApplicantEmail } from '../supabase/functions/_shared/schoolApplicationEmail.ts'

const configured = {
  apiKey: 'test-api-key',
  from: 'noreply@example.test',
  to: 'applicant@example.test',
  subject: 'Review update',
  body: 'Please provide the missing document.',
}

test('email helper fails closed when provider configuration is missing', async () => {
  let requested = false
  const result = await sendApplicantEmail(
    { to: configured.to, subject: configured.subject, body: configured.body },
    async () => {
      requested = true
      return new Response()
    },
  )

  assert.deepEqual(result, { state: 'failed', errorCode: 'provider_unconfigured' })
  assert.equal(requested, false)
})

test('email helper distinguishes provider rejection from unavailable service', async () => {
  const rejected = await sendApplicantEmail(
    configured,
    async () => new Response('{}', { status: 400 }),
  )
  const unavailable = await sendApplicantEmail(
    configured,
    async () => new Response('{}', { status: 503 }),
  )

  assert.deepEqual(rejected, { state: 'failed', errorCode: 'provider_rejected' })
  assert.deepEqual(unavailable, { state: 'unknown', errorCode: 'provider_unavailable' })
})

test('email helper reports acceptance only when the provider returns a message id', async () => {
  let requestBody = ''
  let authorizationHeader = ''
  const accepted = await sendApplicantEmail(
    configured,
    async (_url, init) => {
      requestBody = String(init?.body ?? '')
      authorizationHeader = new Headers(init?.headers).get('Authorization') ?? ''
      return new Response(JSON.stringify({ id: 'provider-message-id' }), { status: 200 })
    },
  )
  const invalid = await sendApplicantEmail(
    configured,
    async () => new Response('{}', { status: 200 }),
  )

  assert.deepEqual(accepted, { state: 'accepted', providerMessageId: 'provider-message-id' })
  assert.deepEqual(JSON.parse(requestBody), {
    from: configured.from,
    to: [configured.to],
    subject: configured.subject,
    text: configured.body,
  })
  assert.equal(authorizationHeader, 'Bearer test-api-key')
  assert.deepEqual(invalid, { state: 'unknown', errorCode: 'provider_response_invalid' })
})

test('email helper hides provider/network error details and reports an unknown outcome', async () => {
  const result = await sendApplicantEmail(configured, async () => {
    throw new Error('private provider response')
  })

  assert.deepEqual(result, { state: 'unknown', errorCode: 'provider_unavailable' })
})
