/**
 * Adversarial fixture: real local HTTP servers (node:http, sealed loopback)
 * drive the OTLP and Langfuse sinks through a stalled connection (timeout), a
 * rejected request (429), and a malformed response body. No external network
 * is touched — the sinks' global `fetch` talks only to `127.0.0.1`.
 * @module dsh-observe/test/fake-server.spec
 */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResolvedLangfuse, ResolvedOtlp } from '../src/config.ts'
import type { ExportRecord, SpanRecord } from '../src/model.ts'
import { LangfuseSink, OtlpSink } from '../src/sinks.ts'

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function span(): SpanRecord {
  return {
    kind: 'turn',
    sessionId: 's1',
    turn: 1,
    startUnixNano: 1_000_000_000,
    endUnixNano: 2_000_000_000,
    attributes: { 'turn.reason': 'completed' },
    status: 'ok',
  }
}

function record(): ExportRecord {
  return { kind: 'span', span: span() }
}

function otlpConfig(endpoint: string, timeoutMs: number): ResolvedOtlp {
  return { endpoint, serviceName: 'test-service', serviceVersion: undefined, headers: {}, timeoutMs }
}

function langfuseConfig(baseUrl: string): ResolvedLangfuse {
  return {
    baseUrl,
    publicKey: 'pk-test',
    secretKey: 'sk-test',
    release: undefined,
    traceName: 'session {session} turn {turn}',
    tags: [],
    timeoutMs: 5_000,
  }
}

/** Bind one server to an ephemeral loopback port and return its base URL. */
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

/** Close a server, tearing down any still-open sockets (e.g. the stalled timeout case). */
async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.()
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error === undefined ? resolve() : reject(error)))
  })
}

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => closeServer(server)))
})

describe('OtlpSink against a real local server', () => {
  it('times out a stalled export (AbortSignal.timeout fires)', async () => {
    const server = createServer(() => {
      // Accept the request but never write a response.
    })
    servers.push(server)
    const baseURL = await listen(server)
    const sink = new OtlpSink(otlpConfig(baseURL, 200), logger)
    await expect(sink.exportSpans([record()])).rejects.toThrow()
  })

  it('rejects a 429 response as a retryable failure', async () => {
    const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'too many requests' }))
    })
    servers.push(server)
    const baseURL = await listen(server)
    const sink = new OtlpSink(otlpConfig(baseURL, 5_000), logger)
    await expect(sink.exportSpans([record()])).rejects.toThrow(/responded 429/u)
  })
})

describe('LangfuseSink against a real local server', () => {
  it('fails a malformed (non-JSON) success body', async () => {
    const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('this is not json')
    })
    servers.push(server)
    const baseURL = await listen(server)
    const sink = new LangfuseSink(langfuseConfig(baseURL), logger)
    await expect(sink.exportSpans([record()])).rejects.toThrow()
  })
})
