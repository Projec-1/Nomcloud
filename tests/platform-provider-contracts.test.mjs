import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSupabaseBackupInventory } from '../supabase/functions/_shared/supabaseBackupInventory.ts'

test('backup inventory reports provider-listed records without claiming restore verification', () => {
  const inventory = parseSupabaseBackupInventory({
    backups: [
      { inserted_at: '2026-10-18T12:00:00.000Z', status: 'COMPLETED' },
      { inserted_at: '2026-10-19T12:00:00.000Z', status: 'COMPLETED' },
    ],
  })
  assert.deepEqual(inventory, {
    status: 'records_found',
    backupCount: 2,
    latestBackupAt: '2026-10-19T12:00:00.000Z',
    latestBackupStatus: 'COMPLETED',
  })
  assert.equal(Object.hasOwn(inventory, 'restore_test'), false)
})

test('backup inventory distinguishes an empty provider result', () => {
  assert.deepEqual(parseSupabaseBackupInventory([]), {
    status: 'none_found',
    backupCount: 0,
    latestBackupAt: null,
    latestBackupStatus: null,
  })
})

test('backup inventory rejects malformed responses and unsafe status values', () => {
  assert.equal(parseSupabaseBackupInventory({ unexpected: [] }), null)
  assert.equal(parseSupabaseBackupInventory([{ unexpected: 'not-a-backup-record' }]), null)

  const inventory = parseSupabaseBackupInventory([
    { created_at: '2026-10-19T12:00:00.000Z', status: 'COMPLETED<script>' },
  ])
  assert.equal(inventory?.status, 'records_found')
  assert.equal(inventory?.latestBackupStatus, null)
})
