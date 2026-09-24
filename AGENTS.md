# AGENTS.md

Standalone DeepSeek Harness plugin repository (`dsh-observe`). Development follows the dsh-plugin-guide skill and the official plugin contract; this file records repo-local decisions.

## Layout

- `src/index.ts` — function-plugin contract (`name`/`inject`/`Config`/`apply`; NO default export — the Loader unwraps `exports.default ?? exports`). Injects `storageDomain` (the durable offline buffer). Async `apply`: opens the domain, assembles sinks/pipelines/collector, registers one `ctx.effect` that owns every timer plus the teardown order (timers → pipeline final flush → domain close), and listens on `session/event`, `session/flush`, and `session/disposed`.
- `src/config.ts` — Schemastery schema + explicit `resolveConfig` (no hidden `?? default` in `run()` paths). Backends are `z.union([z.object({...}), z.const(null)])` — the current Schemastery API has no `nullable()`; absent backends stay `undefined` while explicit `null` also disables, and `resolveConfig` treats both as off. Object defaults are FULL explicit objects (the current `default(value: T)` types strictly). `enabled: true` with no backend throws.
- `src/collector.ts` — the event→span/metric collector over a real `Session`; spans open/close at boundary events, missing closers close with error status, retries derive from identical (name, arguments) pairs, and prompt/completion bodies come only from the session surface and the logged header (call config and tools) — the system prompt is surface node 0 (`system/message`, host 0.1.5). The LLM span finish reason and first-token timing read the embedded `assistant/message` / `assistant/attempt` streams (the required `stream` field, read structurally through local minimal types) and, on the published rc.1 runtime line, the removed legacy `assistant/chunk` events (structural read; the type no longer exists in `SessionEventMap`).
- `src/project.ts` — the text projection of model-visible messages and blocks. V4 carries a tool result as a first-class `role: 'tool'` message (top-level `toolCallId` + `content` + optional `isError`), so the failure marker is applied at MESSAGE level (`projectToolMessage`) — projecting `content` alone cannot distinguish a failed tool from a successful one. The retired session-format-V3 `{ type: 'tool-result', content }` wrapper stays readable only through `isRetiredToolResultWrapper`, an explicitly READ-ONLY compatibility path for logs written before the upgrade (the host rejects that wrapper at physical-row admission: `assertV4ToolResultMessage`); this module never constructs one.
- `src/pipeline.ts` — per-backend delivery: in-memory queue, size/timer flushes, retry with deterministic backoff, spill-over into the durable spool on overflow and on retry exhaustion, periodic spool drain, and final-flush disposal.
- `src/spool.ts` — the bounded offline buffer over a storage-domain table (`zod` value schema — `zod` is therefore a REGULAR runtime dependency, not dev). Records read back from the durable boundary are re-validated with `isExportRecord`.
- `src/sinks.ts` — OTLP/HTTP (traces + aggregated cumulative metrics) and Langfuse (trace-create/span-create/generation-create events with Basic auth). Sinks receive only owned, sanitized records.
- `src/sanitize.ts` — the pre-send sanitization layer (pure functions).
- `src/ids.ts` — deterministic digest ids. The digest includes each part's runtime TYPE: numeric `1` and string `'1'` must never collide into one id.
- `src/remote.ts` — optional Typert remote service (`observe/status`, `observe/setEnabled`) — the runtime kill switch.
- `scripts/` — `prepare.mjs` (build), `verify-self-contained.mjs`, `verify-artifacts.mjs`, `check-readme-sync.mjs` (five-language sync gate), `release.mjs` (bump + stamp + gates + commit + tag, never pushes), `changelog-section.mjs` (release-notes extraction).
- `test/` — vitest; REAL `Context`/`SessionStore`/`Session` and the REAL storage seam (dsh-storage + dsh-storage-json backend in a per-test temp dir + dsh-storage-domain facility) from the 0.1.7-rc.1 peers. Only the network edge (global `fetch`) is scripted. Message-producing session events must carry their `surfaceOp` intent when appended (host 0.1.5+ contract). This plugin is a pure CONSUMER of messages: it holds no `createSystemMessage`/`append`/source-declaration path, so the V4 migration is read-side only.

## Hard rules applied here

- **Off by default.** `enabled: true` AND at least one backend is the opt-in; `enabled: true` with no backend fails the mount loudly.
- **Sanitize before anything else.** Redaction and truncation run at capture, before a record is queued, buffered, or sent; nothing unsanitized ever leaves the process.
- **Model-visible ⟺ logged.** Prompt/completion exports project only the session surface (node 0 is the system prompt) and the logged header (call config and tools) — the exporter invents no model-visible content.
- **Durable boundary re-validation.** Spool records are re-checked with `isExportRecord` when read back; hostile or hand-edited storage cannot reach a sink.
- **Failure loud, failure contained.** Export failures warn, count (`observe.export_failures`), retry, and finally spool; a session/event handler failure is caught and logged so observability can never break the harness hot path. `session/flush` is a fire-and-forget kick — the durability checkpoint never waits on a remote backend.
- **No tunables hardcoded.** Every knob is a validated `Config` field with a default in `src/config.ts`, an inline comment in `cordis.patch.yml`, and a row in the five-language README configuration table.
- **This plugin registers no waterfall listeners.** If one is ever added, allow/passthrough MUST call `next()`.

## Checks

`pnpm run typecheck && pnpm run typecheck:ci && pnpm test && pnpm run test:coverage && pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts && node scripts/check-readme-sync.mjs && pnpm run check:lockfile && pnpm pack`

- `typecheck` (`tsconfig.json` + `tsconfig.test.json`) and `typecheck:ci` (`tsconfig.ci.json`, `skipLibCheck: false` + `verbatimModuleSyntax`) both resolve `@deepseek-ai/*` through `node_modules` to the pinned `0.1.7-rc.1` devDeps — no tsconfig `paths` to a harness checkout is configured, so the two rulers check the same published types. The package ships against the composite peer range `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-0 <0.2.0 || >=0.1.7-0 <0.2.0`, with `0.1.7-rc.1` (= the verified host tag `dsh-v0.1.7-rc.1`) as the development/CI baseline.
- `pnpm-workspace.yaml` holds two load-bearing pin groups beyond the host family. (1) Self-referential `overrides` rows (`@deepseek-ai/dsh-*@^0.1.7-alpha.2` → `0.1.7-rc.1`): pnpm matches a prerelease range only against its own `[major, minor, patch]` tuple, so without them a transitive peer resolves separately and installs a SECOND copy of the host type graph. (2) `@deepseek-ai/cordis` 4.0.3 / `@deepseek-ai/cosmokit` 1.8.4 / `@deepseek-ai/schemastery` 3.18.3 as plain package-name rows (bare peer edges, no direct devDep), plus `@deepseek-ai/cordis-plugin-loader` pinned DOWN to **1.0.3**: cordis 4.0.3 declares loader `^1.0.4` as an optional peer, but on 1.0.4 `Entry._init()` swallows an import/apply failure into `ctx.logger.error` and `Tree.await()` stops rethrowing — a row whose config fails to parse becomes a SILENT unmount and the composition suite loses the failure reason it asserts. Measured 2026-09-22: on 1.0.4 both negative composition cases degraded to the runner's own generic "no OTLP /v1/traces export was issued"; forcing 1.0.3 turned all six green with no source change.
- `test:coverage` gates at 90/80/90/90 (statements/branches/functions/lines), `src/index.ts` excluded.

## Release

`node scripts/release.mjs <x.y.z>` bumps package.json + `src/version.ts`, stamps the CHANGELOG `[Unreleased]` section, re-runs the full gate, and commits + tags (never pushes). `git push origin main --follow-tags` triggers `.github/workflows/release.yml`, which re-runs the gate, publishes to npm with provenance, and creates the GitHub Release from the stamped CHANGELOG section.

## Docs

- Five-language READMEs (`README.md`, `README-zh.md`, `README-es.md`, `README-pt.md`, `README-hi.md`) — keep all five in sync; the English file is the source of truth. `scripts/check-readme-sync.mjs` (CI) enforces section structure and configuration-table keys.
- GitHub topics `dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing` (mirror `package.json` keywords; the ecosystem's visibility channel is the `dsh-plugin` topic).
- License is Apache-2.0 (`LICENSE` + the package.json `license` field). `THIRD_PARTY_NOTICES.md` documents the build-time dependencies.
