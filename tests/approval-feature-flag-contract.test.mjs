import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('approval checks the school-review flag through the service-role RPC contract', async () => {
  const source = await readFile(
    new URL('../supabase/functions/approve-school-application/index.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /adminClient\.rpc\(\s*['"]is_platform_feature_enabled['"]/)
  assert.match(source, /p_flag_key:\s*['"]school_application_review['"]/)
  assert.doesNotMatch(source, /\.from\(\s*['"]platform_feature_flags['"]\s*\)/)
})
