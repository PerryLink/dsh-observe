# AGENTS.md

Standalone DeepSeek Harness plugin repository (`dsh-observe`). Development follows the dsh-plugin-guide skill and the official plugin contract; this file records repo-local decisions.

## Layout

- `src/index.ts` — function-plugin contract (`name`/`inject`/`Config`/`apply`; NO default export — the Loader unwraps `exports.default ?? exports`). Injects `storageDomain` (the durable offline buffer). Async `apply`: opens the domain, assembles sinks/pipelines/collector, registers one `ctx.effect` that owns every timer plus the teardown order (timers → pipeline final flush → domain close), and listens on `session/event`, `session/flush`, and `session/disposed`.
- `src/config.ts` — Schemastery schema + explicit `resolveConfig` (no hidden `?? default` in `run()` paths). Backends are `z.union([z.object({...}), z.const(null)])` — the current Schemastery API has no `nullable()`; absent backends stay `undefined` while explicit `null` also disables, and `resolveConfig` treats both as off. Object defaults are FULL explicit objects (the current `default(value: T)` types strictly). `enabled: true` with no backend throws.
- `src/collector.ts` — the event→span/metric collector over a real `Session`; spans open/close at boundary events, missing closers close with error status, retries derive from identical (name, arguments) pairs, and prompt/completion bodies come only from the logged header and the session surface (model-visible ⟺ logged).
- `src/pipeline.ts` — per-backend delivery: in-memory queue, size/timer flushes, retry with deterministic backoff, spill-over into the durable spool on overflow and on retry exhaustion, periodic spool drain, and final-flush disposal.
- `src/spool.ts` — the bounded offline buffer over a storage-domain table (`zod` value schema — `zod` is therefore a REGULAR runtime dependency, not dev). Records read back from the durable boundary are re-validated with `isExportRecord`.
- `src/sinks.ts` — OTLP/HTTP (traces + aggregated cumulative metrics) and Langfuse (trace-create/span-create/generation-create events with Basic auth). Sinks receive only owned, sanitized records.
- `src/sanitize.ts` — the pre-send sanitization layer (pure functions).
- `src/ids.ts` — deterministic digest ids. The digest includes each part's runtime TYPE: numeric `1` and string `'1'` must never collide into one id.
- `src/remote.ts` — optional Typert remote service (`observe/status`, `observe/setEnabled`) — the runtime kill switch.
- `scripts/` — `prepare.mjs` (build), `verify-self-contained.mjs`, `verify-artifacts.mjs`, `check-readme-sync.mjs` (five-language sync gate), `release.mjs` (bump + stamp + gates + commit + tag, never pushes), `changelog-section.mjs` (release-notes extraction).
- `test/` — vitest; REAL `Context`/`SessionStore`/`Session` and the REAL storage seam (dsh-storage + dsh-storage-json backend in a per-test temp dir + dsh-storage-domain facility) from the 0.1.1-rc.2 peers. Only the network edge (global `fetch`) is scripted. Message-producing session events must carry their `surfaceOp` intent when appended (rc.2 contract).

## Hard rules applied here

- **Off by default.** `enabled: true` AND at least one backend is the opt-in; `enabled: true` with no backend fails the mount loudly.
- **Sanitize before anything else.** Redaction and truncation run at capture, before a record is queued, buffered, or sent; nothing unsanitized ever leaves the process.
- **Model-visible ⟺ logged.** Prompt/completion exports project only the logged header and the session surface — the exporter invents no model-visible content.
- **Durable boundary re-validation.** Spool records are re-checked with `isExportRecord` when read back; hostile or hand-edited storage cannot reach a sink.
- **Failure loud, failure contained.** Export failures warn, count (`observe.export_failures`), retry, and finally spool; a session/event handler failure is caught and logged so observability can never break the harness hot path. `session/flush` is a fire-and-forget kick — the durability checkpoint never waits on a remote backend.
- **No tunables hardcoded.** Every knob is a validated `Config` field with a default in `src/config.ts`, an inline comment in `cordis.patch.yml`, and a row in the five-language README configuration table.
- **This plugin registers no waterfall listeners.** If one is ever added, allow/passthrough MUST call `next()`.

## Checks

`pnpm run typecheck && pnpm run typecheck:ci && pnpm test && pnpm run test:coverage && pnpm run build && pnpm run verify:self-contained && pnpm run verify:artifacts && node scripts/check-readme-sync.mjs && pnpm pack`

- `typecheck` (`tsconfig.json` + `tsconfig.test.json`) and `typecheck:ci` (`tsconfig.ci.json`, `skipLibCheck: false` + `verbatimModuleSyntax`) both resolve `@deepseek-ai/*` through `node_modules` to the pinned `0.1.1-rc.2` devDeps — no tsconfig `paths` to a harness checkout is configured, so the two rulers check the same published types. The package ships against rc.2.
- `test:coverage` gates at 90/80/90/90 (statements/branches/functions/lines), `src/index.ts` excluded.

## Release

`node scripts/release.mjs <x.y.z>` bumps package.json + `src/version.ts`, stamps the CHANGELOG `[Unreleased]` section, re-runs the full gate, and commits + tags (never pushes). `git push origin main --follow-tags` triggers `.github/workflows/release.yml`, which re-runs the gate, publishes to npm with provenance, and creates the GitHub Release from the stamped CHANGELOG section.

## Docs

- Five-language READMEs (`README.md`, `README.zh.md`, `README.es.md`, `README.pt.md`, `README.hi.md`) — keep all five in sync; the English file is the source of truth. `scripts/check-readme-sync.mjs` (CI) enforces section structure and configuration-table keys.
- GitHub topics `dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing` (mirror `package.json` keywords; the ecosystem's visibility channel is the `dsh-plugin` topic).
- License is Apache-2.0 (`LICENSE` + the package.json `license` field). `THIRD_PARTY_NOTICES.md` documents the build-time dependencies.
