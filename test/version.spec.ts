/**
 * Version consistency tripwire: the hardcoded src/version.ts stamp (OTLP
 * instrumentation scope) must track package.json or released artifacts
 * advertise a stale version. `scripts/release.mjs` bumps both.
 * @module dsh-observe/test/version.spec
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/version.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

describe('version stamp', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }
    expect(VERSION).toBe(pkg.version)
  })

  it('is a semver without a leading v', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/u)
  })
})
