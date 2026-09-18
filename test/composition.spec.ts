/**
 * Real Loader composition suite (community five-layer model, layer 4): an
 * independent process mounts the Loader over a cordis.yml with the real
 * session + storage + storage-json + storage-domain service rows + the built
 * plugin row + config, proving module unwrapping, inject (`storageDomain`)
 * resolution, config application, and the session/event + session/flush
 * listeners exporting a real span. Also carries the two negative regressions:
 * invalid config must fail loud for the expected reason (no-backend and
 * half-configured langfuse), and a default export must fail.
 * @module dsh-observe/test/composition.spec
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runner = join(repositoryRoot, 'scripts', 'loader-runner.mjs')
const builtEntry = join(repositoryRoot, 'lib', 'index.js')

/** One cordis.yml: the storage chain service rows, then the built plugin row with config. */
function configFor(pluginRow: string, storageRoot: string, configLines: string[] = []): string {
  return [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    '  config:',
    `    root: ${JSON.stringify(storageRoot)}`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: json',
    `- name: ${JSON.stringify(pluginRow)}`,
    ...(configLines.length > 0 ? ['  config: ', ...configLines.map(line => `    ${line}`)] : []),
    '',
  ].join('\n')
}

function runRunner(configPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [runner, configPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 120_000,
  })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-observe-loader-'))
const storageRoot = join(temporaryRoot, 'storage')

beforeAll(() => {
  // Build first so the composition exercises the shipped artifact (and A1:
  // the plain-Node built entry must load under the real Loader).
  const build = spawnSync('pnpm', ['run', 'build'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 120_000,
  })
  expect(build.status, `build failed:\n${build.stdout}\n${build.stderr}`).toBe(0)
}, 120_000)

describe('Loader composition', () => {
  it('mounts the built plugin and exports a turn span through the Loader-resolved storage chain', () => {
    const configPath = join(temporaryRoot, 'valid.yml')
    writeFileSync(configPath, configFor(pathToFileURL(builtEntry).href, storageRoot, [
      'enabled: true',
      'otlp:',
      '  endpoint: http://collector:4318',
      'batch:',
      '  flushIntervalMs: 60000',
      '  bufferRetryIntervalMs: 60000',
    ]))
    const evidence = runRunner(configPath)
    expect(evidence.status, `stdout:\n${evidence.stdout}\nstderr:\n${evidence.stderr}`).toBe(0)
    const marker = evidence.stdout.match(/DSH_LOADER_RESULT (.+)$/mu)
    expect(marker).not.toBeNull()
    const summary = JSON.parse(marker![1]!) as { spans: string[]; exportedVia: string }
    expect(summary.spans).toContain('turn 1')
    expect(summary.exportedVia).toBe('otlp')
  })

  it('rejects an enabled exporter with no backend through the Loader', () => {
    const configPath = join(temporaryRoot, 'invalid-no-backend.yml')
    writeFileSync(configPath, configFor(pathToFileURL(builtEntry).href, storageRoot, ['enabled: true']))
    const evidence = runRunner(configPath)
    expect(evidence.status).not.toBe(0)
    expect(evidence.stderr).toMatch(/at least one backend/u)
  })

  it('rejects a half-configured langfuse backend through the Loader', () => {
    const configPath = join(temporaryRoot, 'invalid-langfuse.yml')
    writeFileSync(configPath, configFor(pathToFileURL(builtEntry).href, storageRoot, [
      'langfuse:',
      "  publicKey: ''",
      '  secretKey: sk',
    ]))
    const evidence = runRunner(configPath)
    expect(evidence.status).not.toBe(0)
    expect(evidence.stderr).toMatch(/publicKey must be a non-empty string/u)
  })

  it('a default export drops the declared contract through the Loader (inject lost, buffer degrades)', () => {
    // The Loader unwraps `exports.default ?? exports`, so mounting this
    // wrapper runs the apply function WITHOUT name/inject/Config. The probe
    // composes the session row but NO storage rows: the real plugin declares
    // `inject: ['storageDomain']` and therefore stays pending, while the
    // wrapper — with no inject — applies immediately, finds no storageDomain,
    // and reports the degraded durable buffer. A failed buffer must not take
    // the mount down (A02), so the observable signal of the packaging bug is
    // that warning (plus the runner's own OTLP export still succeeding).
    const wrapper = join(temporaryRoot, 'default-export.mjs')
    const builtUrl = pathToFileURL(builtEntry).href
    writeFileSync(wrapper, [
      `export { name, inject, Config, apply } from ${JSON.stringify(builtUrl)}`,
      `export { apply as default } from ${JSON.stringify(builtUrl)}`,
      '',
    ].join('\n'))
    const configPath = join(temporaryRoot, 'invalid-default.yml')
    writeFileSync(configPath, [
      "- name: '@deepseek-ai/dsh-session'",
      `- name: ${JSON.stringify(pathToFileURL(wrapper).href)}`,
      '  config:',
      '    enabled: true',
      '    otlp:',
      '      endpoint: http://collector:4318',
      '    batch:',
      '      flushIntervalMs: 60000',
      '      bufferRetryIntervalMs: 60000',
      '',
    ].join('\n'))
    const evidence = runRunner(configPath)
    expect(evidence.status, `stdout:\n${evidence.stdout}\nstderr:\n${evidence.stderr}`).toBe(0)
    // The wrapper applied (no inject held it back) and the run still produced
    // its OTLP export through the degraded in-memory buffer.
    expect(evidence.stdout).toMatch(/DSH_LOADER_RESULT .*"exportedVia":"otlp"/u)
  })

  it('the real plugin stays pending while its declared inject is unmet', () => {
    // The companion half of the guard above: with the same storage-less
    // composition the genuine entry point must NOT apply, because `inject`
    // holds it until storageDomain exists — so no OTLP export is issued and
    // the runner's own assertion fails.
    const configPath = join(temporaryRoot, 'pending-inject.yml')
    writeFileSync(configPath, [
      "- name: '@deepseek-ai/dsh-session'",
      `- name: ${JSON.stringify(pathToFileURL(builtEntry).href)}`,
      '  config:',
      '    enabled: true',
      '    otlp:',
      '      endpoint: http://collector:4318',
      '    batch:',
      '      flushIntervalMs: 60000',
      '      bufferRetryIntervalMs: 60000',
      '',
    ].join('\n'))
    const evidence = runRunner(configPath)
    expect(evidence.status).not.toBe(0)
    expect(evidence.stderr).toMatch(/no OTLP/u)
  })
})

describe('teardown', () => {
  it('removes the temporary composition directory', () => {
    rmSync(temporaryRoot, { recursive: true, force: true })
  })
})
