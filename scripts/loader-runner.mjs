// scripts/loader-runner.mjs — real Loader composition runner (community
// five-layer model, layer 4). An independent process boots a real Context,
// mounts the vendored Loader with the Include builtin, reads the given
// cordis.yml (session + storage + storage-json + storage-domain + plugin
// rows + config), then proves the plugin's inject (`storageDomain`) resolved
// and its session/event + session/flush listeners export a real span through
// the pipeline to a scripted OTLP endpoint.
//
// Usage: node scripts/loader-runner.mjs <cordis.yml>
// Exit 0 prints DSH_LOADER_RESULT <json>; any assertion or load failure exits
// non-zero with the reason on stderr (used by the invalid-config and
// default-export regression cases).

import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const configArgument = process.argv[2]
if (configArgument === undefined) {
  console.error('usage: loader-runner.mjs <cordis.yml>')
  process.exit(2)
}

const configPath = resolve(configArgument)
// Resolve bare package rows from this repository's dependency tree so the
// composition works with config files written anywhere (e.g. a temp dir).
const configRequire = createRequire(resolve(import.meta.dirname, '../package.json'))

const ctx = new Context()
try {
  ctx.baseUrl = `${pathToFileURL(dirname(configPath)).href}/`
  await ctx.plugin(Loader)
  ctx.loader.internal = /** @type {any} */ ({
    version: 'v2',
    async import(specifier) {
      if (specifier.startsWith('file:')) return import(specifier)
      if (specifier.startsWith('node:')) return import(specifier)
      const absolute = /^([a-zA-Z]:)?[\\/]/u.test(specifier)
      return import(pathToFileURL(absolute ? specifier : configRequire.resolve(specifier)).href)
    },
  })
  ctx.loader.builtins.include = Include
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()

  // Authoritative behavior: with `enabled: true` + an OTLP backend, a turn
  // span must be exported through the pipeline on session/flush.
  const fetchCalls = []
  globalThis.fetch = async (input, init) => {
    fetchCalls.push({ url: typeof input === 'string' ? input : input.url, init })
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const session = ctx.sessions.create(SessionId('dsh-observe-loader-runner'))
  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.emit('session/flush', session)

  const start = Date.now()
  while (fetchCalls.length === 0 && Date.now() - start < 5_000) {
    await new Promise(ok => setTimeout(ok, 10))
  }
  const tracesCall = fetchCalls.find(call => call.url.endsWith('/v1/traces'))
  if (tracesCall === undefined) {
    throw new Error('Loader composition: no OTLP /v1/traces export was issued')
  }
  const body = JSON.parse(String(tracesCall.init?.body))
  const spanNames = body.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.map(span => span.name) ?? []
  if (!spanNames.includes('turn 1')) {
    throw new Error(`Loader composition: expected a "turn 1" span, got ${JSON.stringify(spanNames)}`)
  }

  process.stdout.write(`DSH_LOADER_RESULT ${JSON.stringify({ spans: spanNames, exportedVia: 'otlp' })}\n`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
} finally {
  await ctx.fiber.dispose()
}
