import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { parseWorkflowRequest } from '../supabase/functions/_shared/schoolApplicationContract.ts'

const applicationId = '00000000-0000-4000-8000-000000000000'
const secondApplicationId = '20000000-0000-4000-8000-000000000000'
const reviewerId = '10000000-0000-4000-8000-000000000000'

test('workflow contract accepts supported review, note and onboarding actions', () => {
  const cases = [
    [{ application_id: applicationId, action: 'assign_reviewer', reviewer_id: reviewerId }, 'assign_reviewer'],
    [{ application_id: applicationId, action: 'change_priority', priority: 'urgent' }, 'change_priority'],
    [{ application_id: applicationId, action: 'set_due_date', due_at: null }, 'set_due_date'],
    [{ application_id: applicationId, action: 'add_note', body: 'Reviewed', mentions: [reviewerId] }, 'add_note'],
    [{ application_id: applicationId, action: 'update_document', document_id: 'license', state: 'verified' }, 'update_document'],
    [{ application_id: applicationId, action: 'start_onboarding' }, 'start_onboarding'],
    [{ application_id: applicationId, action: 'update_onboarding', checklist: { first_login: true } }, 'update_onboarding'],
  ]

  for (const [input, expectedAction] of cases) {
    assert.equal(parseWorkflowRequest(input)?.action, expectedAction)
  }
})

test('workflow contract accepts bounded unique batch targets and email actions for server rejection', () => {
  const batch = parseWorkflowRequest({
    application_ids: [applicationId, secondApplicationId],
    action: 'archive',
  })
  assert.deepEqual(batch?.application_ids, [applicationId, secondApplicationId])

  const email = parseWorkflowRequest({
    application_id: applicationId,
    action: 'request_information',
    subject: 'More details',
    body: 'Please provide the missing document.',
  })
  assert.equal(email?.action, 'request_information')
})

test('workflow contract rejects unsupported actions, malformed ids and unexpected payload fields', () => {
  assert.equal(parseWorkflowRequest({ application_id: applicationId, action: 'approve' }), null)
  assert.equal(parseWorkflowRequest({ application_id: 'not-a-uuid', action: 'reopen' }), null)
  assert.equal(parseWorkflowRequest({
    application_id: applicationId,
    action: 'change_priority',
    priority: 'auto-approve',
  }), null)
  assert.equal(parseWorkflowRequest({
    application_id: applicationId,
    action: 'add_note',
    body: 'Note',
    unexpected: true,
  }), null)
  assert.equal(parseWorkflowRequest({
    application_ids: [applicationId, applicationId],
    action: 'archive',
  }), null)
  assert.equal(parseWorkflowRequest({
    application_ids: Array.from({ length: 101 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`),
    action: 'archive',
  }), null)
})
