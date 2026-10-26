import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const operatorId = '11111111-1111-4111-8111-111111111111'
const applicationId = '22222222-2222-4222-8222-222222222222'
const caseId = '44444444-4444-4444-8444-444444444444'
const incidentId = '55555555-5555-4555-8555-555555555555'
const operatorProfile = {
  id: operatorId,
  email: 'operator@example.test',
  full_name: 'Test Operator',
  school_id: null,
}
const operatorUser = {
  id: operatorId,
  aud: 'authenticated',
  role: 'authenticated',
  email: operatorProfile.email,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: operatorProfile.full_name },
  created_at: '2026-01-01T00:00:00.000Z',
}
const operatorSession = JSON.stringify({
  access_token: 'test-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'test-refresh-token',
  user: operatorUser,
})

const platformRoutes = [
  ['/platform', 'Overview'],
  ['/platform/actions', 'Action Center'],
  ['/platform/schools', 'Schools'],
  ['/platform/people', 'People'],
  ['/platform/requests', 'Requests & Reviews'],
  ['/platform/applications', 'School Applications'],
  ['/platform/communications', 'Communications'],
  ['/platform/operations', 'Operations Queue'],
  ['/platform/analytics', 'Analytics'],
  ['/platform/activity', 'Activity'],
  ['/platform/audit', 'Audit Logs'],
  ['/platform/health', 'System Health'],
  ['/platform/maintenance', 'Maintenance'],
  ['/platform/security', 'Security'],
  ['/platform/permissions', 'Permissions'],
  ['/platform/operators', 'Operators'],
  ['/platform/features', 'Features'],
  ['/platform/integrations', 'Integrations'],
  ['/platform/billing', 'Billing'],
  ['/platform/data', 'Data'],
  ['/platform/backups', 'Backups & Recovery'],
  ['/platform/settings', 'Settings'],
]

let server
let browser
let baseUrl
let localOrigin

before(async () => {
  server = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    root,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  })
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
  localOrigin = new URL(baseUrl).origin
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await server?.close()
})

async function createOperatorPage({
  isPlatformAdmin = true,
  failCaseReads = false,
  failCaseInserts = false,
  failContactMessageUpdates = false,
  failIncidentInserts = false,
  failIncidentUpdates = false,
  failIncidentUpdateInserts = false,
  failResponderUpdates = false,
  failWorkflowAction = false,
  failApprovalAction = false,
  failControlUpdates = false,
  failHealthCheck = false,
  failBackupCheck = false,
  failReads = new Set(),
  contactMessages = [],
  memberships = [],
  applications = [],
  cases = [],
  incidents = [],
  schools = [],
  schoolSubscriptions = [],
  subscriptionPlans = [],
  featureFlags = [
    { flag_key: 'operations_queue', enabled: true, description: 'Operations queue', updated_at: '2026-01-01T00:00:00.000Z' },
    { flag_key: 'incident_command', enabled: true, description: 'Incident command', updated_at: '2026-01-01T00:00:00.000Z' },
    { flag_key: 'school_application_review', enabled: true, description: 'School application review', updated_at: '2026-01-01T00:00:00.000Z' },
    { flag_key: 'billing_ledger', enabled: true, description: 'Billing ledger', updated_at: '2026-01-01T00:00:00.000Z' },
  ],
  maintenanceSettings = [{
    singleton: true,
    enabled: false,
    message: 'Maintenance in progress.',
    starts_at: null,
    ends_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
  }],
  healthChecks = [],
  backupChecks = [],
  billingInvoices = [],
  billingPayments = [],
  billingEvents = [],
  schoolProfiles = [],
  operatorGrants = [{
    id: 'test-admin-grant',
    user_id: operatorId,
    granted_at: '2026-01-01T00:00:00.000Z',
    revoked_at: null,
    team: 'Operations',
    profiles: { full_name: operatorProfile.full_name, email: operatorProfile.email },
  }],
} = {}) {
  const context = await browser.newContext()
  await context.addInitScript((serializedSession) => {
    localStorage.setItem('nomcloud_cookie_consent', 'essential-only')
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      if (/^sb-.+-auth-token$/.test(key)) return serializedSession
      return getItem.call(this, key)
    }
  }, operatorSession)

  const observed = { reads: [], writes: [], functionInvocations: [], unexpectedExternalRequests: [] }
  const recordedHealthChecks = [...healthChecks]
  const recordedBackupChecks = [...backupChecks]
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === localOrigin) {
      await route.continue()
      return
    }

    if (['stylesheet', 'font'].includes(request.resourceType())) {
      await route.fulfill({ status: 200, body: '' })
      return
    }

    const json = (status, body, headers = {}) => route.fulfill({
      status,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(body),
    })

    if (url.pathname.startsWith('/functions/v1/')) {
      if (request.method() === 'OPTIONS') {
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'POST, OPTIONS',
          },
        })
        return
      }

      const functionName = url.pathname.slice('/functions/v1/'.length)
      let body = null
      try {
        body = request.postDataJSON()
      } catch {
        body = null
      }
      observed.functionInvocations.push({ functionName, body })

      if (functionName === 'approve-school-application') {
        if (failApprovalAction) {
          await json(409, { error: 'Mocked approval conflict' }, { 'access-control-allow-origin': '*' })
          return
        }
        await json(200, {
          application_id: applicationId,
          school_id: '66666666-6666-4666-8666-666666666666',
          user_id: '77777777-7777-4777-8777-777777777777',
          email: 'applicant@example.test',
          activation_email_sent: false,
          activation_email_error: 'Provider unavailable in isolated test',
          school_name: 'Browser Test School',
        }, { 'access-control-allow-origin': '*' })
        return
      }

      if (functionName === 'manage-school-application') {
        if (failWorkflowAction) {
          await json(403, { error: 'Mocked reviewer workflow denied' }, { 'access-control-allow-origin': '*' })
          return
        }
        const action = typeof body?.action === 'string' ? body.action : 'unknown'
        await json(200, {
          results: [{ application_id: applicationId, action, ok: true }],
          total: 1,
          succeeded: 1,
          failed: 0,
        }, { 'access-control-allow-origin': '*' })
        return
      }

      if (functionName === 'platform-health-check') {
        if (failHealthCheck) {
          await json(500, { error: 'Health checks could not be recorded', error_code: 'health_record_failed' }, { 'access-control-allow-origin': '*' })
          return
        }
        const checkedAt = new Date().toISOString()
        recordedHealthChecks.unshift(
          { id: 'mock-health-operations', service_name: 'operator_tables', status: 'healthy', duration_ms: 12, failure_code: null, checked_at: checkedAt },
          { id: 'mock-health-database', service_name: 'database', status: 'healthy', duration_ms: 8, failure_code: null, checked_at: checkedAt },
        )
        await json(200, { source: 'on_demand', checks: [] }, { 'access-control-allow-origin': '*' })
        return
      }

      if (functionName === 'platform-backup-status') {
        if (failBackupCheck) {
          recordedBackupChecks.unshift({
            id: 'mock-backup-unavailable',
            provider: 'supabase',
            status: 'unknown',
            backup_count: null,
            latest_backup_at: null,
            latest_backup_status: null,
            error_code: 'management_api_unconfigured',
            checked_at: new Date().toISOString(),
          })
          await json(503, { error: 'Supabase Management API access is not configured', error_code: 'management_api_unconfigured' }, { 'access-control-allow-origin': '*' })
          return
        }
        recordedBackupChecks.unshift({
          id: 'mock-backup-record',
          provider: 'supabase',
          status: 'records_found',
          backup_count: 2,
          latest_backup_at: '2026-10-19T12:00:00.000Z',
          latest_backup_status: 'COMPLETED',
          error_code: null,
          checked_at: new Date().toISOString(),
        })
        await json(200, { provider: 'supabase', status: 'records_found', backup_count: 2, restore_test: 'not_verified' }, { 'access-control-allow-origin': '*' })
        return
      }

      await json(404, { error: 'Unknown function blocked by test' }, { 'access-control-allow-origin': '*' })
      return
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length)
      const method = request.method()

      if (method === 'GET' || method === 'HEAD') {
        observed.reads.push({ method, table })
        if (method === 'GET' && failReads.has(table)) {
          await json(503, { message: `Mocked ${table} read unavailable` })
          return
        }

        if (table === 'platform_cases' && failCaseReads) {
          await json(403, { code: '42501', message: 'Mocked case read denied' })
          return
        }

        if (method === 'HEAD') {
          await route.fulfill({ status: 200, headers: { 'content-range': '*/0' } })
          return
        }

        if (table === 'profiles' && url.searchParams.get('id') === `eq.${operatorId}`) {
          await json(200, operatorProfile)
          return
        }

        if (table === 'memberships') {
          await json(200, memberships)
          return
        }

        if (table === 'schools') {
          await json(200, schools)
          return
        }

        if (table === 'school_subscriptions') {
          await json(200, schoolSubscriptions)
          return
        }

        if (table === 'subscription_plans') {
          await json(200, subscriptionPlans)
          return
        }

        if (table === 'platform_feature_flags') {
          const key = url.searchParams.get('flag_key')?.replace(/^eq\./, '')
          const matching = key ? featureFlags.find((flag) => flag.flag_key === key) : featureFlags
          await json(200, matching ?? [])
          return
        }

        if (table === 'platform_maintenance_settings') {
          await json(200, maintenanceSettings[0] ?? [])
          return
        }

        if (table === 'platform_health_checks') {
          await json(200, recordedHealthChecks)
          return
        }

        if (table === 'platform_backup_checks') {
          await json(200, recordedBackupChecks)
          return
        }

        if (table === 'platform_invoices') {
          await json(200, billingInvoices)
          return
        }

        if (table === 'platform_payments') {
          await json(200, billingPayments)
          return
        }

        if (table === 'platform_billing_events') {
          await json(200, billingEvents)
          return
        }

        if (table === 'audit_logs') {
          await json(200, [])
          return
        }

        if (table === 'students' || table === 'teachers') {
          await route.fulfill({ status: 200, headers: { 'content-range': '*/0' } })
          return
        }

        if (table === 'profiles') {
          await json(200, schoolProfiles)
          return
        }

        if (table === 'platform_admins' && url.searchParams.get('user_id') === `eq.${operatorId}`) {
          await json(200, isPlatformAdmin ? { id: 'test-admin-grant' } : [])
          return
        }

        if (table === 'platform_admins') {
          await json(200, operatorGrants)
          return
        }

        if (table === 'contact_messages') {
          await json(200, contactMessages)
          return
        }

        if (table === 'school_applications') {
          await json(200, applications)
          return
        }

        if (table === 'platform_cases') {
          await json(200, cases)
          return
        }

        if (table === 'platform_incidents') {
          await json(200, incidents)
          return
        }

        await json(200, [])
        return
      }

      if (method === 'PATCH' && table === 'contact_messages') {
        let body = null
        try {
          body = request.postDataJSON()
        } catch {
          body = null
        }
        observed.writes.push({ method, table, body })
        if (failContactMessageUpdates) {
          await json(403, { code: '42501', message: 'Mocked contact-message update denied' })
          return
        }
        await json(200, { id: 'test-contact-message-id' })
        return
      }

      if (method === 'PATCH' && ['platform_feature_flags', 'platform_maintenance_settings'].includes(table)) {
        let body = null
        try {
          body = request.postDataJSON()
        } catch {
          body = null
        }
        observed.writes.push({ method, table, body })
        if (failControlUpdates) {
          await json(403, { code: '42501', message: 'Mocked control update denied' })
          return
        }
        const response = table === 'platform_feature_flags'
          ? { flag_key: url.searchParams.get('flag_key')?.replace(/^eq\./, ''), ...body }
          : { singleton: true, ...body }
        await json(200, response)
        return
      }

      if (method === 'PATCH' && ['platform_cases', 'platform_incidents'].includes(table)) {
        let body = null
        try {
          body = request.postDataJSON()
        } catch {
          body = null
        }
        observed.writes.push({ method, table, body })
        if (table === 'platform_incidents' && failIncidentUpdates) {
          await json(403, { code: '42501', message: 'Mocked incident update denied' })
          return
        }
        await json(200, { id: table === 'platform_cases' ? caseId : incidentId })
        return
      }

      if (method === 'POST' && table === 'rpc/set_platform_incident_responders') {
        let body = null
        try {
          body = request.postDataJSON()
        } catch {
          body = null
        }
        observed.writes.push({ method, table, body })
        if (failResponderUpdates) {
          await json(403, { code: '42501', message: 'Mocked responder assignment denied' })
          return
        }
        await json(200, null)
        return
      }

      if (method === 'POST' && [
        'platform_cases',
        'platform_case_events',
        'platform_incidents',
        'platform_incident_updates',
      ].includes(table)) {
        let body = null
        try {
          body = request.postDataJSON()
        } catch {
          body = null
        }
        observed.writes.push({ method, table, body })

        if (table === 'platform_cases' && failCaseInserts) {
          await json(403, { code: '42501', message: 'Mocked case insert denied' })
          return
        }
        if (table === 'platform_incidents' && failIncidentInserts) {
          await json(403, { code: '42501', message: 'Mocked incident insert denied' })
          return
        }
        if (table === 'platform_incident_updates' && failIncidentUpdateInserts) {
          await json(403, { code: '42501', message: 'Mocked incident update insert denied' })
          return
        }

        const id = table === 'platform_cases'
          ? 'test-case-id'
          : table === 'platform_incidents' ? 'test-incident-id' : 'test-event-id'
        await json(201, { id }, { 'content-range': '*/1' })
        return
      }

      observed.writes.push({ method, table })
      await json(403, { code: '42501', message: 'Unmocked write blocked by test' })
      return
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      await json(200, url.pathname.endsWith('/user') ? operatorUser : [])
      return
    }

    observed.unexpectedExternalRequests.push({ method: request.method(), path: url.pathname })
    await json(403, { message: 'External request blocked by test' })
  })

  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(30000)
  return { context, page, observed }
}

test('all platform routes load within the operator workspace', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    for (const [route, label] of platformRoutes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
      await page.locator('nav button[aria-current="page"]').waitFor()
      const activeRoute = await page.locator('nav button[aria-current="page"]').innerText()
      assert.ok(activeRoute.includes(label), `${route} should select ${label}`)
      assert.notEqual(new URL(page.url()).pathname, '/login', `${route} should remain authenticated`)
      assert.equal(await page.getByText(/we could not verify your platform access/i).count(), 0)
    }
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('school administrators cannot enter platform routes', async () => {
  const { context, page, observed } = await createOperatorPage({
    isPlatformAdmin: false,
    memberships: [{
      id: 'test-school-membership',
      user_id: operatorId,
      school_id: '88888888-8888-4888-8888-888888888888',
      role: 'owner',
      status: 'active',
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform`)
    await page.waitForURL('**/login')
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('case creation sends the expected database payload and reports success only after insert', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    await page.goto(`${baseUrl}/platform/operations`)
    const createButton = page.getByRole('button', { name: 'New case' })
    await createButton.waitFor({ state: 'visible' })
    await createButton.click()
    await page.getByLabel('Case title').fill('Browser test case')
    await page.getByLabel('Issue details').fill('Isolated browser test details')
    await page.getByRole('button', { name: 'Create case' }).click()
    await page.getByText('Case created.').waitFor()

    const write = observed.writes.find((item) => item.table === 'platform_cases')
    assert.deepEqual(write?.body, {
      title: 'Browser test case',
      case_type: 'support',
      description: 'Isolated browser test details',
      school_id: null,
      priority: 'normal',
      due_at: null,
      assigned_operator_id: null,
      team: null,
      created_by: operatorId,
    })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('case creation stays disabled when the required case read fails', async () => {
  const { context, page, observed } = await createOperatorPage({ failCaseReads: true })
  try {
    await page.goto(`${baseUrl}/platform/operations`)
    await page.getByRole('alert').waitFor()
    assert.equal(await page.getByRole('button', { name: 'New case' }).isDisabled(), true)
    assert.deepEqual(observed.writes, [])
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed case inserts are surfaced without a success-shaped response', async () => {
  const { context, page, observed } = await createOperatorPage({ failCaseInserts: true })
  try {
    await page.goto(`${baseUrl}/platform/operations`)
    await page.getByRole('button', { name: 'New case' }).click()
    await page.getByLabel('Case title').fill('Rejected browser test case')
    await page.getByLabel('Issue details').fill('The mocked API rejects this insert')
    await page.getByRole('button', { name: 'Create case' }).click()
    await page.getByText(/Case was not created:/).waitFor()
    assert.equal(await page.getByText('Case created.').count(), 0)
    assert.equal(observed.writes.filter((item) => item.table === 'platform_cases').length, 1)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('incident creation sends the expected database payload', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Open incident' }).click()
    await page.getByLabel('Incident title').fill('Browser test incident')
    await page.getByLabel('Incident summary').fill('Isolated browser test summary')
    await page.getByRole('button', { name: 'Open command' }).click()
    await page.getByText('Incident command opened.').waitFor()

    const write = observed.writes.find((item) => item.table === 'platform_incidents')
    assert.deepEqual(write?.body, {
      title: 'Browser test incident',
      description: 'Isolated browser test summary',
      severity: 'sev2',
      affected_services: [],
      commander_id: null,
      linked_case_id: null,
      created_by: operatorId,
    })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed incident creation shows an error and no success result', async () => {
  const { context, page, observed } = await createOperatorPage({ failIncidentInserts: true })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Open incident' }).click()
    await page.getByLabel('Incident title').fill('Rejected browser test incident')
    await page.getByLabel('Incident summary').fill('The mocked API rejects this insert')
    await page.getByRole('button', { name: 'Open command' }).click()
    await page.getByText(/Incident was not opened:/).waitFor()

    assert.equal(await page.getByText('Incident command opened.').count(), 0)
    assert.equal(observed.writes.filter((item) => item.table === 'platform_incidents').length, 1)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('operations case notes are persisted as private case events', async () => {
  const { context, page, observed } = await createOperatorPage({
    cases: [{
      id: caseId,
      title: 'Browser test case details',
      case_type: 'support',
      status: 'open',
      priority: 'normal',
      severity: 'sev3',
      description: 'Isolated case fixture',
      school_id: null,
      assigned_operator_id: null,
      team: null,
      due_at: null,
      requires_approval: false,
      approval_status: 'not_required',
      source_contact_message_id: null,
      resolution: null,
      created_at: '2026-01-01T00:00:00.000Z',
      first_response_at: null,
      resolved_at: null,
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/operations/${caseId}`)
    await page.getByLabel('Private note').fill('Isolated case note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.getByText('Private note added to the case history.').waitFor()

    const write = observed.writes.find((item) => item.table === 'platform_case_events')
    assert.equal(write?.body.case_id, caseId)
    assert.equal(write?.body.event_type, 'note')
    assert.equal(write?.body.body, 'Isolated case note')
    assert.equal(write?.body.evidence_reference, null)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('case assignment uses the active platform-admin grant id', async () => {
  const { context, page, observed } = await createOperatorPage({
    cases: [{
      id: caseId,
      title: 'Assignment fixture',
      case_type: 'support',
      status: 'open',
      priority: 'normal',
      severity: 'sev3',
      description: 'Isolated assignment fixture',
      school_id: null,
      assigned_operator_id: null,
      team: null,
      due_at: null,
      requires_approval: false,
      approval_status: 'not_required',
      source_contact_message_id: null,
      resolution: null,
      created_at: '2026-01-01T00:00:00.000Z',
      first_response_at: null,
      resolved_at: null,
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/operations/${caseId}`)
    await page.getByLabel('Assigned operator').selectOption('test-admin-grant')
    await page.getByText('Case assignment updated.').waitFor()

    const write = observed.writes.find((item) => item.method === 'PATCH' && item.table === 'platform_cases')
    assert.deepEqual(write?.body, { assigned_operator_id: 'test-admin-grant' })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('case resolution persists its required summary together with the resolved status', async () => {
  const { context, page, observed } = await createOperatorPage({
    cases: [{
      id: caseId,
      title: 'Resolution fixture',
      case_type: 'support',
      status: 'investigating',
      priority: 'normal',
      severity: 'sev3',
      description: 'Isolated resolution fixture',
      school_id: null,
      assigned_operator_id: null,
      team: null,
      due_at: null,
      requires_approval: false,
      approval_status: 'not_required',
      source_contact_message_id: null,
      resolution: null,
      created_at: '2026-01-01T00:00:00.000Z',
      first_response_at: null,
      resolved_at: null,
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/operations/${caseId}`)
    await page.getByLabel('Resolution summary').fill('Service restored and verified')
    await page.getByRole('button', { name: 'Record resolution' }).click()
    await page.getByText('Case resolved and recorded.').waitFor()

    const write = observed.writes.find((item) => item.method === 'PATCH' && item.table === 'platform_cases')
    assert.deepEqual(write?.body, {
      resolution: 'Service restored and verified',
      status: 'resolved',
    })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('incident command updates are persisted with their selected update type', async () => {
  const { context, page, observed } = await createOperatorPage({
    incidents: [{
      id: incidentId,
      title: 'Browser test incident details',
      description: 'Isolated incident fixture',
      severity: 'sev2',
      status: 'investigating',
      affected_services: ['test service'],
      commander_id: null,
      linked_case_id: null,
      postmortem: null,
      postmortem_reviewed_at: null,
      started_at: '2026-01-01T00:00:00.000Z',
      resolved_at: null,
      platform_incident_responders: [],
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Manage incident' }).click()
    await page.getByLabel('Command log').selectOption('recovery_step')
    await page.getByPlaceholder('Record a status update or recovery action').fill('Isolated recovery step')
    await page.getByRole('button', { name: 'Record update' }).click()
    await page.getByText('Recovery step recorded.').waitFor()

    const write = observed.writes.find((item) => item.table === 'platform_incident_updates')
    assert.equal(write?.body.incident_id, incidentId)
    assert.equal(write?.body.update_type, 'recovery_step')
    assert.equal(write?.body.body, 'Isolated recovery step')
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed incident updates show an error and no success notification', async () => {
  const { context, page, observed } = await createOperatorPage({
    failIncidentUpdateInserts: true,
    incidents: [{
      id: incidentId,
      title: 'Rejected update incident',
      description: 'Isolated incident fixture',
      severity: 'sev2',
      status: 'investigating',
      affected_services: ['test service'],
      commander_id: null,
      linked_case_id: null,
      postmortem: null,
      postmortem_reviewed_at: null,
      started_at: '2026-01-01T00:00:00.000Z',
      resolved_at: null,
      platform_incident_responders: [],
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Manage incident' }).click()
    await page.getByPlaceholder('Record a status update or recovery action').fill('Rejected command update')
    await page.getByRole('button', { name: 'Record update' }).click()
    await page.getByText(/Incident update was not saved:/).waitFor()

    assert.equal(await page.getByText('Incident update recorded.').count(), 0)
    assert.equal(observed.writes.filter((item) => item.table === 'platform_incident_updates').length, 1)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed incident resolution shows an error and does not claim the incident was updated', async () => {
  const { context, page, observed } = await createOperatorPage({
    failIncidentUpdates: true,
    incidents: [{
      id: incidentId,
      title: 'Rejected resolution incident',
      description: 'Isolated incident fixture',
      severity: 'sev2',
      status: 'investigating',
      affected_services: ['test service'],
      commander_id: null,
      linked_case_id: null,
      postmortem: null,
      postmortem_reviewed_at: null,
      started_at: '2026-01-01T00:00:00.000Z',
      resolved_at: null,
      platform_incident_responders: [],
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    const incident = page.locator('article').filter({ hasText: 'Rejected resolution incident' })
    await incident.getByLabel('Status').selectOption('resolved')
    await page.getByText(/Incident was not updated:/).waitFor()

    assert.equal(await page.getByText('Incident status updated.').count(), 0)
    assert.deepEqual(
      observed.writes.filter((item) => item.method === 'PATCH' && item.table === 'platform_incidents')[0]?.body,
      { status: 'resolved' },
    )
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('incident resolution persists the resolved status through the database-backed control', async () => {
  const { context, page, observed } = await createOperatorPage({
    incidents: [{
      id: incidentId,
      title: 'Resolution fixture incident',
      description: 'Isolated incident resolution fixture',
      severity: 'sev2',
      status: 'investigating',
      affected_services: ['test service'],
      commander_id: null,
      linked_case_id: null,
      postmortem: null,
      postmortem_reviewed_at: null,
      started_at: '2026-01-01T00:00:00.000Z',
      resolved_at: null,
      platform_incident_responders: [],
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    const incident = page.locator('article').filter({ hasText: 'Resolution fixture incident' })
    await incident.getByLabel('Status').selectOption('resolved')
    await page.getByText('Incident status updated.').waitFor()

    const write = observed.writes.find((item) => item.method === 'PATCH' && item.table === 'platform_incidents')
    assert.deepEqual(write?.body, { status: 'resolved' })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('incident responders are saved through the authorized responder RPC', async () => {
  const { context, page, observed } = await createOperatorPage({
    incidents: [{
      id: incidentId,
      title: 'Responder assignment incident',
      description: 'Isolated responder fixture',
      severity: 'sev2',
      status: 'investigating',
      affected_services: [],
      commander_id: null,
      linked_case_id: null,
      postmortem: null,
      postmortem_reviewed_at: null,
      started_at: '2026-01-01T00:00:00.000Z',
      resolved_at: null,
      platform_incident_responders: [],
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Manage incident' }).click()
    await page.getByRole('checkbox', { name: /Test Operator/ }).check()
    await page.getByRole('button', { name: 'Save responders' }).click()
    await page.getByText('Incident responders updated.').waitFor()

    const write = observed.writes.find((item) => item.table === 'rpc/set_platform_incident_responders')
    assert.deepEqual(write?.body, {
      p_incident_id: incidentId,
      p_operator_ids: ['test-admin-grant'],
    })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed incident responder assignment shows an error and no success notification', async () => {
  const { context, page, observed } = await createOperatorPage({
    failResponderUpdates: true,
    incidents: [{
      id: incidentId,
      title: 'Rejected responder assignment incident',
      description: 'Isolated responder fixture',
      severity: 'sev2',
      status: 'investigating',
      affected_services: [],
      commander_id: null,
      linked_case_id: null,
      postmortem: null,
      postmortem_reviewed_at: null,
      started_at: '2026-01-01T00:00:00.000Z',
      resolved_at: null,
      platform_incident_responders: [],
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Manage incident' }).click()
    await page.getByRole('checkbox', { name: /Test Operator/ }).check()
    await page.getByRole('button', { name: 'Save responders' }).click()
    await page.getByText(/Responders were not updated:/).waitFor()

    assert.equal(await page.getByText('Incident responders updated.').count(), 0)
    assert.equal(observed.writes.filter((item) => item.table === 'rpc/set_platform_incident_responders').length, 1)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('routes without a backend keep their unavailable state visible', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByText(/No health checks have been recorded/).waitFor()
    await page.goto(`${baseUrl}/platform/billing`)
    await page.getByText(/No invoice records are present/).waitFor()
    await page.goto(`${baseUrl}/platform/integrations`)
    await page.getByText('No integration registry', { exact: true }).waitFor()
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('billing shows joined subscription-plan labels and honest empty ledger states', async () => {
  const schoolId = '99999999-9999-4999-8999-999999999999'
  const schoolAdminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const { context, page, observed } = await createOperatorPage({
    schools: [{
      id: schoolId,
      shortcode: 'browser-school',
      name: 'Billing Fixture School',
      status: 'active',
      address: 'Test City',
      phone: '+000000000',
      email: 'school@example.test',
      country: 'XX',
      created_at: '2026-01-01T00:00:00.000Z',
      suspended_at: null,
      suspension_reason: null,
    }],
    memberships: [{
      user_id: schoolAdminId,
      school_id: schoolId,
      role: 'owner',
      status: 'active',
    }],
    schoolSubscriptions: [{
      school_id: schoolId,
      plan_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
    }],
    subscriptionPlans: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Test Annual Plan',
    }],
    schoolProfiles: [{
      id: schoolAdminId,
      school_id: schoolId,
      full_name: 'School Owner',
      email: 'owner@example.test',
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/billing`)
    await page.getByText('Test Annual Plan', { exact: true }).waitFor()
    await page.getByText(/No invoice records are present/).waitFor()
    await page.getByText(/No payment records are present/).waitFor()
    assert.deepEqual(observed.writes, [])
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('billing ledger read failures remain distinct from an empty ledger', async () => {
  const { context, page, observed } = await createOperatorPage({
    failReads: new Set(['platform_invoices']),
  })
  try {
    await page.goto(`${baseUrl}/platform/billing`, { waitUntil: 'commit' })
    await page.getByRole('heading', { name: 'Billing', exact: true }).waitFor({ timeout: 20000 })
    await page.getByRole('alert').waitFor({ timeout: 12000 })
    assert.match(await page.getByRole('alert').innerText(), /Mocked platform_invoices read unavailable/)
    await page.getByText('Invoice records could not be loaded.', { exact: false }).waitFor()
    await page.getByText('Payment history could not be loaded.', { exact: false }).waitFor()
    assert.equal(await page.getByText('No invoice records are present.', { exact: false }).count(), 0)
    assert.equal(await page.getByText('No payment records are present.', { exact: false }).count(), 0)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('feature flag changes persist through the protected platform table', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    await page.goto(`${baseUrl}/platform/features`)
    const toggle = page.getByLabel('Enable Operations Queue')
    await toggle.waitFor()
    await toggle.click()
    await page.getByText('Disabled', { exact: true }).waitFor()
    assert.ok(observed.writes.some((write) =>
      write.table === 'platform_feature_flags' && write.body?.enabled === false,
    ))
  } finally {
    await context.close()
  }
})

test('feature flag read failures do not expose controls or claim an empty result', async () => {
  const { context, page, observed } = await createOperatorPage({
    failReads: new Set(['platform_feature_flags']),
  })
  try {
    await page.goto(`${baseUrl}/platform/features`, { waitUntil: 'commit' })
    await page.getByRole('heading', { name: 'Features', exact: true }).waitFor({ timeout: 20000 })
    await page.getByRole('alert').waitFor({ timeout: 12000 })
    assert.match(await page.getByRole('alert').innerText(), /Mocked platform_feature_flags read unavailable/)
    await page.getByText('Feature-flag records could not be loaded.', { exact: false }).waitFor()
    assert.equal(await page.getByLabel('Enable Operations Queue').count(), 0)
    assert.equal(await page.getByText('No feature-flag records are available.', { exact: false }).count(), 0)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('maintenance changes persist the server setting and audit-relevant message', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    await page.goto(`${baseUrl}/platform/maintenance`)
    await page.getByLabel('Enable maintenance mode').check()
    await page.getByLabel('Message shown to operators').fill('Planned platform maintenance')
    await page.getByRole('button', { name: 'Save maintenance settings' }).click()
    await page.getByText(/Maintenance settings saved/).waitFor()
    const write = observed.writes.find((item) => item.table === 'platform_maintenance_settings')
    assert.equal(write?.body?.enabled, true)
    assert.equal(write?.body?.message, 'Planned platform maintenance')
  } finally {
    await context.close()
  }
})

test('maintenance read failures do not show an off state or allow saving', async () => {
  const { context, page, observed } = await createOperatorPage({
    failReads: new Set(['platform_maintenance_settings']),
  })
  try {
    await page.goto(`${baseUrl}/platform/maintenance`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /Mocked platform_maintenance_settings read unavailable/)
    await page.getByText('Maintenance settings are unavailable until the server record loads successfully.').waitFor()
    await page.getByText('Unavailable', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Enable maintenance mode').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Save maintenance settings' }).count(), 0)
    assert.equal(observed.writes.length, 0)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('on-demand health checks invoke the protected monitor and report persisted status', async () => {
  const { context, page, observed } = await createOperatorPage()
  try {
    await page.goto(`${baseUrl}/platform/health`)
    await page.getByRole('button', { name: 'Run health checks' }).click()
    await page.getByText('Healthy', { exact: true }).first().waitFor()
    assert.ok(observed.functionInvocations.some((call) => call.functionName === 'platform-health-check'))
  } finally {
    await context.close()
  }
})

test('health history read failures do not appear as an unchecked or empty probe result', async () => {
  const { context, page, observed } = await createOperatorPage({
    failReads: new Set(['platform_health_checks']),
  })
  try {
    await page.goto(`${baseUrl}/platform/health`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /Mocked platform_health_checks read unavailable/)
    await page.getByText('Health history could not be loaded. Use Retry history above before treating this result as empty.').waitFor()
    assert.equal(await page.getByText('No health checks have been recorded.', { exact: false }).count(), 0)
    assert.ok(await page.getByText('Unavailable', { exact: true }).count() > 0)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('backup status failure remains explicit and never claims a successful backup', async () => {
  const { context, page, observed } = await createOperatorPage({ failBackupCheck: true })
  try {
    await page.goto(`${baseUrl}/platform/backups`)
    await page.getByRole('button', { name: 'Check provider status' }).click()
    await page.getByRole('alert').waitFor()
    await page.getByText('Not verified', { exact: true }).first().waitFor()
    assert.ok(observed.functionInvocations.some((call) => call.functionName === 'platform-backup-status'))
    assert.equal(await page.getByText(/Backup successful/i).count(), 0)
  } finally {
    await context.close()
  }
})

test('backup history read failures do not appear as an empty provider inventory', async () => {
  const { context, page, observed } = await createOperatorPage({
    failReads: new Set(['platform_backup_checks']),
  })
  try {
    await page.goto(`${baseUrl}/platform/backups`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /Mocked platform_backup_checks read unavailable/)
    await page.getByText('Provider-check history could not be loaded. Retry history above before treating this result as empty.').waitFor()
    assert.equal(await page.getByText('No confirmed backup inventory is available.', { exact: false }).count(), 0)
    assert.ok(await page.getByText('Unavailable', { exact: true }).count() > 0)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('handling a contact request updates the real contact-message fields', async () => {
  const messageId = '33333333-3333-4333-8333-333333333333'
  const { context, page, observed } = await createOperatorPage({
    contactMessages: [{
      id: messageId,
      name: 'Test requester',
      email: 'requester@example.test',
      topic: 'Test request topic',
      message: 'Isolated browser test message',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z',
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/requests`)
    await page.getByRole('button', { name: /Isolated browser test message/ }).click()
    await page.getByRole('button', { name: 'Mark handled' }).click()

    const write = observed.writes.find((item) => item.table === 'contact_messages')
    assert.equal(write?.method, 'PATCH')
    assert.equal(write?.body.status, 'handled')
    assert.equal(write?.body.handled_by, operatorId)
    assert.ok(Number.isFinite(Date.parse(write?.body.handled_at)))
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed contact-message handling shows an error and no success result', async () => {
  const messageId = '33333333-3333-4333-8333-333333333333'
  const { context, page, observed } = await createOperatorPage({
    failContactMessageUpdates: true,
    contactMessages: [{
      id: messageId,
      name: 'Test requester',
      email: 'requester@example.test',
      topic: 'Test request topic',
      message: 'Isolated browser test message',
      status: 'new',
      created_at: '2026-01-01T00:00:00.000Z',
    }],
  })
  try {
    await page.goto(`${baseUrl}/platform/requests`)
    await page.getByRole('button', { name: /Isolated browser test message/ }).click()
    await page.getByRole('button', { name: 'Mark handled' }).click()
    await page.getByText(/Request was not updated:/).waitFor()
    assert.equal(await page.getByText('Request marked handled.').count(), 0)
    assert.equal(observed.writes.filter((item) => item.table === 'contact_messages').length, 1)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('school application detail saves internal notes through the workflow function', async () => {
  const { context, page, observed } = await createOperatorPage({ applications: [applicationFixture()] })
  try {
    await page.goto(`${baseUrl}/platform/applications`)
    await page.getByRole('link', { name: /Browser Test School/ }).click()
    await page.getByRole('heading', { name: 'Review actions' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Reject application' }).isDisabled(), true)

    await page.getByLabel('Add a private note').fill('Reviewer-only test note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.getByText('Internal note added.').waitFor()

    const invocation = observed.functionInvocations.find((item) => item.functionName === 'manage-school-application')
    assert.deepEqual(invocation?.body, {
      action: 'add_note',
      application_id: applicationId,
      body: 'Reviewer-only test note',
      mentions: [],
    })
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed school-application workflow requests show an error and not a success notification', async () => {
  const { context, page, observed } = await createOperatorPage({
    applications: [applicationFixture()],
    failWorkflowAction: true,
  })
  try {
    await page.goto(`${baseUrl}/platform/applications`)
    await page.getByRole('link', { name: /Browser Test School/ }).click()
    await page.getByLabel('Add a private note').fill('Reviewer-only rejected note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.getByRole('alert').getByText(/Mocked reviewer workflow denied/).waitFor()
    assert.equal(await page.getByText('Internal note added.').count(), 0)
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('school approval starts onboarding but accurately reports the missing activation email', async () => {
  const { context, page, observed } = await createOperatorPage({ applications: [applicationFixture()] })
  try {
    await page.goto(`${baseUrl}/platform/applications`)
    await page.getByRole('link', { name: /Browser Test School/ }).click()
    await page.getByLabel('School shortcode').fill('browser-school')
    await page.getByRole('button', { name: 'Approve and start onboarding' }).click()
    await page.getByRole('button', { name: 'Confirm approval' }).click()
    await page.getByText('The school and administrator were created, but the activation email was not sent').waitFor()

    const approval = observed.functionInvocations.find((item) => item.functionName === 'approve-school-application')
    assert.deepEqual(approval?.body, { application_id: applicationId, shortcode: 'browser-school' })
    const workflowCalls = observed.functionInvocations
      .filter((item) => item.functionName === 'manage-school-application')
      .map((item) => item.body)
    assert.deepEqual(workflowCalls, [
      { action: 'start_onboarding', application_id: applicationId },
      {
        action: 'update_onboarding',
        application_id: applicationId,
        checklist: { admin_invited: false },
      },
    ])
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

test('failed school approval displays the server error and records no successful approval', async () => {
  const { context, page, observed } = await createOperatorPage({
    applications: [applicationFixture()],
    failApprovalAction: true,
  })
  try {
    await page.goto(`${baseUrl}/platform/applications`)
    await page.getByRole('link', { name: /Browser Test School/ }).click()
    await page.getByLabel('School shortcode').fill('browser-school')
    await page.getByRole('button', { name: 'Approve and start onboarding' }).click()
    await page.getByRole('button', { name: 'Confirm approval' }).click()
    await page.getByRole('alert').getByText(/Mocked approval conflict/).waitFor()

    assert.equal(await page.getByText(/is approved/).count(), 0)
    assert.equal(
      observed.functionInvocations.filter((item) => item.functionName === 'approve-school-application').length,
      1,
    )
    assert.deepEqual(observed.unexpectedExternalRequests, [])
  } finally {
    await context.close()
  }
})

function applicationFixture() {
  return {
    id: applicationId,
    school_name: 'Browser Test School',
    administrator_name: 'Test Applicant',
    email: 'applicant@example.test',
    phone: '+000000000',
    school_size_band: 'small',
    message: 'Isolated application fixture',
    country: 'XX',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    approved_school_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    city: 'Test City',
    assigned_reviewer: null,
    priority: 'normal',
    review_due_at: null,
    archived_at: null,
    document_checklist: {},
    review_checklist: {
      required_fields_complete: false,
      contact_valid: false,
      school_identity_verified: false,
    },
    review_flags: {},
    onboarding_checklist: {},
  }
}
