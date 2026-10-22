import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platformRoot = path.join(root, 'src', 'pages', 'platform')
const operatorRoot = path.join(platformRoot, 'operator')

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filePath)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [filePath] : []
  }))
  return files.flat()
}

test('Operator Workspace production sources do not ship the fabricated prototype dataset', async () => {
  await assert.rejects(access(path.join(operatorRoot, 'prototypeData.ts')), { code: 'ENOENT' })

  const files = await sourceFiles(platformRoot)
  const imports = await Promise.all(files.map(async (filePath) => ({
    filePath,
    content: await readFile(filePath, 'utf8'),
  })))
  const importingFiles = imports
    .filter(({ content }) => /from\s+['"][^'"]*prototypeData(?:\.ts)?['"]/.test(content))
    .map(({ filePath }) => path.relative(root, filePath))

  assert.deepEqual(importingFiles, [])
})
