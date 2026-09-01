<div align="center">

# 📊 dsh-observe
- **1024 store channel**: `npm i -g dsh1024` once, then `dsh1024 plugin --profile web add dsh-observe` (counts toward the [deepseek1024.com](https://deepseek1024.com) install ranking).
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-observe)

**OpenTelemetry and Langfuse observability exporter for DeepSeek Harness.**

*Turn session events into OTLP traces and Langfuse observations — sanitized, buffered, off by default.*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-brightgreen.svg)](#)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-observe/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-observe/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-observe?label=version)](https://github.com/PerryLink/dsh-observe/releases)
[![npm version](https://img.shields.io/npm/v/dsh-observe)](https://www.npmjs.com/package/dsh-observe)
[![npm downloads](https://img.shields.io/npm/dm/dsh-observe)](https://www.npmjs.com/package/dsh-observe)

[English](README.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [Português](README.pt.md) · [हिन्दी](README.hi.md)

</div>

---

## Compatibility

| Surface | Status |
|---|---|
| Harness | DeepSeek Harness `0.1.1-rc.2` 0.1.2-alpha.2 (adapted 2026-08-31): the session envelope keeps its ignorable field for stored-log read compatibility only - Session.append still cannot stamp it, so audit-gate behavior is unchanged. |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Backends | OpenTelemetry OTLP/HTTP (traces + metrics, JSON encoding) and Langfuse (LLM observability) — either or both |
| Model | Model-agnostic: it exports the session/event stream; no model calls are made |

## What you get

`dsh-observe` turns the harness's `session/event` stream into standard observability protocols:

- **Spans** — turn, step, tool-call (duration, status, retry derivation), and LLM generation spans, linked into per-turn traces with deterministic ids.
- **Metrics** — per-provider/model token counters, USD cost counters (configurable pricing table), and the optional context-pressure gauge from `ctx.tokenMeter`.
- **Sanitized capture** — prompt and completion bodies are redacted (structural key names + built-in secret patterns + your patterns) and truncated before anything is queued or sent.
- **Reliability** — async batching (size- and timer-triggered), a bounded durable offline buffer (storage-domain) with oldest-first eviction, and deterministic exponential-backoff retries; undeliverable batches survive restarts.
- **Runtime kill switch** — the optional Typert remote (`observe/status`, `observe/setEnabled`) lets a settings page stop and resume exporting without unmounting.
- **Off by default** — `enabled: true` plus at least one backend is an explicit opt-in; nothing is captured or exported otherwise.

```text
session/event stream
   │ collector (turn/step/tool/llm spans, metrics)
   │ sanitize (keys, secrets, budgets)
   ├──▶ pipeline "otlp"  ── queue ── flush ──▶ OTLP /v1/traces + /v1/metrics
   │         └─ retry/backoff ─┐
   ├──▶ pipeline "langfuse" ── queue ── flush ──▶ Langfuse ingestion
   │         └─ retry/backoff ─┤
   └────────── durable spool (offline buffer, bounded) ◀┘
```

## Quick start

```sh
# 1. install the bundle into your profile
dsh plugin --profile web add "github:PerryLink/dsh-observe#main"

# or from npm (published releases)
dsh plugin --profile web add dsh-observe

# 2. configure a backend in your profile patch (cordis.yml) and restart
dsh --profile web
```

Minimal OTLP configuration (the row ships commented out in `cordis.patch.yml`):

```yaml
- insert:
    - id: dsh-observe
      name: dsh-observe
      config:
        enabled: true
        otlp:
          endpoint: http://localhost:4318
```

Then verify the row mounts:

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-observe'
```

## Install & uninstall

- **git channel** (latest `main`): `dsh plugin --profile web add "github:PerryLink/dsh-observe#main"` — the `prepare` script builds with production dependencies only.
- **npm channel** (published releases): `dsh plugin --profile web add dsh-observe`.
- **tarball channel**: `pnpm pack` in this repo, then `dsh plugin --profile web add ./dsh-observe-<version>.tgz`.
- **uninstall**: `dsh plugin --profile web remove dsh-observe` (or remove the row from the profile patch).

> If pnpm reports `ERR_PNPM_IGNORED_BUILDS` for this package (esbuild's harmless platform-binary validation), add `allowBuilds: { esbuild: true }` to your `pnpm-workspace.yaml` — the `dsh` CLI prints the exact snippet.

## Configuration

All tunables are Schemastery `Config` fields (changeable from cordis.yml). An id-targeted override replaces the whole row — restate every key you need. `cordis.patch.yml` documents each key inline.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Master switch; `true` plus at least one backend is the explicit opt-in |
| `otlp` | `null` | OTLP backend config, or `null` to disable it |
| `otlp.endpoint` | *(required)* | OTLP base URL; `/v1/traces` and `/v1/metrics` are appended |
| `otlp.serviceName` | `deepseek-harness` | `service.name` resource attribute |
| `otlp.serviceVersion` | *(none)* | `service.version` resource attribute |
| `otlp.headers` | `{}` | Extra headers merged into every export request |
| `otlp.timeoutMs` | `10000` | Per-request timeout |
| `langfuse` | `null` | Langfuse backend config, or `null` to disable it |
| `langfuse.baseUrl` | `https://cloud.langfuse.com` | Langfuse base URL |
| `langfuse.publicKey` | *(required)* | Project public key |
| `langfuse.secretKey` | *(required)* | Project secret key |
| `langfuse.release` | *(none)* | Release tag stamped onto traces |
| `langfuse.traceName` | `session {session} turn {turn}` | Trace-name template; `{session}`/`{turn}` interpolate per trace |
| `langfuse.tags` | `[]` | Static tags stamped onto every trace |
| `langfuse.timeoutMs` | `10000` | Per-request timeout |
| `capture.turns` | `true` | Turn lifecycle spans |
| `capture.steps` | `true` | Step lifecycle spans |
| `capture.tools` | `true` | Tool-call spans with sanitized arguments/results |
| `capture.llm` | `true` | LLM generation spans |
| `llm.prompt` | `true` | Capture the sanitized request prompt (`false` = sizes only) |
| `llm.completion` | `true` | Capture the sanitized completion (`false` = sizes only) |
| `metadata.sessionId` | `true` | Session id attribute |
| `metadata.cwd` | `false` | Session working directory (a local path — off by default) |
| `metadata.agentPreset` | `true` | Agent preset id attribute |
| `metadata.model` | `true` | Provider/model attributes |
| `metrics.tokens` | `true` | Per-provider/model token counters |
| `metrics.cost` | `true` | USD cost counters (need `pricing` rules to match) |
| `metrics.contextTokens` | `true` | Context-pressure gauge (needs `ctx.tokenMeter`) |
| `pricing` | `[]` | Pricing table, first match wins: `{ provider?, model, inputPerToken, outputPerToken, cacheReadPerToken?, cacheWritePerToken? }` |
| `sanitize.enabled` | `true` | Redaction master switch (`false` disables redaction, never truncation) |
| `sanitize.redactKeys` | `[]` | Extra key-name substrings (key/token/secret/password/authorization/credential/apiKey are always included) |
| `sanitize.redactPatterns` | `[]` | Extra secret regular expressions |
| `sanitize.truncatePromptChars` | `4000` | Prompt character budget |
| `sanitize.truncateCompletionChars` | `4000` | Completion character budget |
| `sanitize.truncateToolInputChars` | `2000` | Tool argument character budget |
| `sanitize.truncateToolOutputChars` | `2000` | Tool result character budget |
| `sanitize.truncateAttributeChars` | `512` | Span attribute string budget |
| `batch.maxRecords` | `256` | Flush once the queue holds this many records |
| `batch.flushIntervalMs` | `5000` | Timer flush interval |
| `batch.maxQueueRecords` | `2000` | In-memory queue bound; excess spills to the buffer |
| `batch.maxBufferRecords` | `10000` | Durable offline buffer bound; oldest records drop first |
| `batch.bufferRetryIntervalMs` | `30000` | Offline buffer retry interval |
| `retry.maxAttempts` | `5` | Attempts per batch, including the first try |
| `retry.baseDelayMs` | `1000` | First backoff delay |
| `retry.factor` | `2` | Backoff multiplier per consecutive failure |
| `retry.maxDelayMs` | `60000` | Backoff ceiling |
| `remote.enabled` | `false` | Mount the `observe` Typert remote (kill switch) |

## Tools & surfaces

This plugin registers **no model tools** — it is a background exporter. Its surfaces:

- **Consumes** `session/event` (span/metric collection), `session/flush` (best-effort export kick — the durability checkpoint never waits on a remote backend), and `session/disposed`.
- **Optional remote service** `observe` — `observe/status` returns the kill-switch state, configured backends, queue depths, and buffer occupancy; `observe/setEnabled` stops and resumes exporting at runtime.

## Permissions & data

- **Permissions**: `network:outbound` to the endpoints you configure, `session:read` for the event stream, `storage:write` for the offline buffer; no native code, no filesystem access.
- **Data**: everything sent is derived from the session log and sanitized (redaction + truncation) before it is queued, buffered, or transmitted. The offline buffer stores only sanitized records, re-validated when read back.
- **Credentials**: Langfuse public/secret keys travel only to the configured Langfuse endpoint; OTLP headers only to the configured OTLP endpoint. The plugin stores no credentials itself — keep them in credential references or environment-injected values.

## Security boundaries

- **Off by default** — nothing is captured or exported unless you opt in explicitly.
- **Sanitize before send** — structural key redaction, built-in secret patterns (API keys, GitHub tokens, AWS keys, bearer credentials, private keys), your patterns, and character budgets all apply before any record leaves memory.
- **Durable boundary re-validation** — records read back from storage are checked again before a sink can see them.
- **Failure loud, failure contained** — export failures warn, count, retry, and finally spool; a failing session handler is caught and logged so observability can never break the harness hot path.
- **Model-visible ⟺ logged** — prompt/completion exports project only the logged header and the session surface; the exporter invents no content.

## Known limitations

- **rc.2 only** — the plugin is developed and tested against `@deepseek-ai/dsh@0.1.1-rc.2`; newer harness baselines are expected to work but are verified by the monthly compat workflow.
- **Metrics bypass the retry/spool path** — OTLP metrics are aggregated cumulatively, so a lost flush self-heals on the next one (by design, not a bug).
- **No sampling** — every enabled span family is exported; set `capture.*` switches and `batch.maxBufferRecords` for high-volume sessions.

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc: src + tests against the local harness checkout
pnpm run typecheck:ci  # tsc against the published 0.1.1-rc.2 types (no paths)
pnpm test           # vitest: 114 tests, 18 suites (real Context/Session/storage seam)
pnpm run test:coverage  # coverage gate (90/80/90/90)
pnpm run build      # tsdown bundle + tsc declarations (lib/)
pnpm run verify:self-contained  # dependency specs resolve from the registry
pnpm run verify:artifacts       # built ESM face + bundle patch present
node scripts/check-readme-sync.mjs  # five-language README sync gate
pnpm pack           # the published tarball
```

## Topics

`dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing`

## Contributors

- [@PerryLink](https://github.com/PerryLink) — creator and maintainer: collector, pipelines, spool, OTLP/Langfuse sinks, sanitization, and the five-language docs.

## PerryLink DSH Plugin Family

This project is one of the [33 DeepSeek Harness plugins](https://github.com/PerryLink) maintained by [PerryLink](https://github.com/PerryLink). If this one helps you, the others likely will too:

| Plugin | One-liner |
|---|---|
| **[dsh-dsh-auto-review](https://github.com/PerryLink/dsh-dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default | |
| **[dsh-dsh-background-agents](https://github.com/PerryLink/dsh-dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | |
| **[dsh-dsh-budget](https://github.com/PerryLink/dsh-dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | |
| **[dsh-dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-dsh-checkpoint-rewind)** | Claude Code /rewind-equivalent: snapshots, session forks, one-shot restore | |
| **[dsh-dsh-claude-move](https://github.com/PerryLink/dsh-dsh-claude-move)** | Migrate Claude Code sessions, memory, skills and CLAUDE.md into DSH | |
| **[dsh-dsh-click](https://github.com/PerryLink/dsh-dsh-click)** | Cross-platform native desktop control for DeepSeek Harness — Windows first. | |
| **[dsh-dsh-composer-history](https://github.com/PerryLink/dsh-dsh-composer-history)** | Terminal-style input history for the web composer: arrows, Ctrl+R search | |
| **[dsh-dsh-data-quality](https://github.com/PerryLink/dsh-dsh-data-quality)** | Dataset quality checks and citation cross-checks (the optional numeric bridge consumed here) | |
| **[dsh-dsh-defend](https://github.com/PerryLink/dsh-dsh-defend)** | Prompt-injection, jailbreak, and secret-leak defense for DeepSeek Harness. | |
| **[dsh-dsh-doublecheck](https://github.com/PerryLink/dsh-dsh-doublecheck)** | Engineering-discipline guard: requirements grill, test gates, adversary review | |
| **[dsh-dsh-draw](https://github.com/PerryLink/dsh-dsh-draw)** | Unified static-image generation routing for DeepSeek Harness. | |
| **[dsh-dsh-fast](https://github.com/PerryLink/dsh-dsh-fast)** | Read-only performance diagnostics for DeepSeek Harness. | |
| **[dsh-dsh-fund-research](https://github.com/PerryLink/dsh-dsh-fund-research)** | Deterministic research reports for Chinese public mutual funds | |
| **[dsh-dsh-github](https://github.com/PerryLink/dsh-dsh-github)** | GitHub PR/issues integration for DSH, every write gated by approval | |
| **[dsh-dsh-industry-research](https://github.com/PerryLink/dsh-dsh-industry-research)** | Industry research orchestration that seals its deliverables through this plugin's `ctx.researchReport.assemble` | |
| **[dsh-dsh-library](https://github.com/PerryLink/dsh-dsh-library)** | Local document knowledge base for DeepSeek Harness. | |
| **[dsh-dsh-local-ai](https://github.com/PerryLink/dsh-dsh-local-ai)** | Local-model (Ollama) integration for DeepSeek Harness. | |
| **[dsh-dsh-lsp-actions](https://github.com/PerryLink/dsh-dsh-lsp-actions)** | LSP diagnostics, formatting, completion, code actions and rename over language servers | |
| **[dsh-dsh-mask](https://github.com/PerryLink/dsh-dsh-mask)** | PII masking middleware: anonymize at the model boundary, restore at the display layer | |
| **[dsh-dsh-mcp-panel](https://github.com/PerryLink/dsh-dsh-mcp-panel)** | Read-only MCP runtime panel: /mcp command + Settings tab with status, tools and errors | |
| **[dsh-dsh-memento](https://github.com/PerryLink/dsh-dsh-memento)** | Approval-gated cross-session memory: ctx.memory seam + SQLite + memory tool | |
| **[dsh-dsh-output-styles](https://github.com/PerryLink/dsh-dsh-output-styles)** | Claude Code outputStyles-equivalent runtime style switching | |
| **[dsh-dsh-permission-rules](https://github.com/PerryLink/dsh-dsh-permission-rules)** | Claude Code-style declarative allow/deny/ask permission rules with audit | |
| **[dsh-dsh-plugin-guide](https://github.com/PerryLink/dsh-dsh-plugin-guide)** | Plugin-development knowledge base as an on-demand agent skill | |
| **[dsh-dsh-research-report](https://github.com/PerryLink/dsh-dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions | |
| **[dsh-dsh-score](https://github.com/PerryLink/dsh-dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. | |
| **[dsh-dsh-session-pin](https://github.com/PerryLink/dsh-dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | |
| **[dsh-dsh-session-sync](https://github.com/PerryLink/dsh-dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. | |
| **[dsh-dsh-skill-pack-security](https://github.com/PerryLink/dsh-dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review | |
| **[dsh-dsh-talk](https://github.com/PerryLink/dsh-dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. | |
| **[dsh-dsh-test-drive](https://github.com/PerryLink/dsh-dsh-test-drive)** | Isolated install-and-smoke test drives for DeepSeek Harness plugins. | |
| **[dsh-dsh-translate](https://github.com/PerryLink/dsh-dsh-translate)** | Vendor parameter translation and deterministic JSON repair for DeepSeek Harness. | |

## License

[Apache License 2.0](LICENSE) © 2026 dsh-observe contributors
