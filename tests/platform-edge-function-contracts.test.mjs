import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const functionSources = new Map(
  await Promise.all(
    [
      'manage-school-application',
      'platform-health-check',
      'platform-backup-status',
      'approve-school-application',
    ].map(async (name) => [
      name,
      await readFile(
        new URL(`../supabase/functions/${name}/index.ts`, import.meta.url),
        'utf8',
      ),
    ]),
  ),
)

test('platform POST functions allow browser preflight and restrict methods', () => {
  for (const [name, source] of functionSources) {
    assert.match(
      source,
      /["']Access-Control-Allow-Methods["']:\s*["']POST,\s*OPTIONS["']/,
      `${name} must advertise POST and OPTIONS to browser preflight`,
    )
    assert.match(
      source,
      /if\s*\(request\.method\s*!==\s*["']POST["']\)/,
      `${name} must reject non-POST requests`,
    )
    assert.match(
      source,
      /if\s*\(request\.method\s*===\s*["']OPTIONS["']\)/,
      `${name} must handle preflight requests`,
    )
  }
})

test('platform operational functions retain explicit server-side authorization', () => {
  for (const name of [
    'manage-school-application',
    'platform-health-check',
    'platform-backup-status',
  ]) {
    const source = functionSources.get(name)
    assert.match(source, /auth\.getUser\(/, `${name} must validate the bearer token`)
    assert.match(source, /\.from\(["']platform_admins["']\)/, `${name} must check platform-admin access`)
    assert.match(source, /\.is\(["']revoked_at["'],\s*null\)/, `${name} must reject revoked admin grants`)
  }
})

test('health and backup checks use real provider evidence and never claim a restore', () => {
  const health = functionSources.get('platform-health-check')
  assert.match(health, /\.from\(["']schools["']\)/)
  assert.match(health, /\.from\(["']platform_cases["']\)/)
  assert.match(health, /\.from\(["']platform_incidents["']\)/)
  assert.match(health, /\.rpc\(\s*["']record_platform_health_checks["']/)

  const backup = functionSources.get('platform-backup-status')
  assert.match(backup, /Deno\.env\.get\(["']SUPABASE_ACCESS_TOKEN["']\)/)
  assert.match(backup, /api\.supabase\.com\/v1\/projects\/.*\/database\/backups/)
  assert.match(backup, /parseSupabaseBackupInventory\(payload\)/)
  assert.match(backup, /restore_test:\s*["']not_verified["']/)
})
