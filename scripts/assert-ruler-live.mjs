#!/usr/bin/env node
// Assert the type ruler is live: compiling scripts/ruler-canary.ts against the
// current type line must FAIL (the canary references alpha.1-only constructs —
// the removed `assistant/chunk` event and the legacy schema-only codec). A
// green compile means the ruler measures a stale alpha.1 / rc.2 face.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tsc = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.canary.json'], {
  cwd: root,
  encoding: 'utf8',
})
const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const symbolHits =
  (out.match(/assistant\/chunk/g) ?? []).length
  + (out.match(/create/g) ?? []).length
if (result.status !== 0 && symbolHits >= 2) {
  console.log('ruler-live: canary correctly fails against the current type line')
  process.exit(0)
}
console.error('ruler-stale: canary compiled (stale alpha.1 face) or failed unexpectedly')
console.error(out)
process.exit(1)
