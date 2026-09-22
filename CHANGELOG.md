# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Tool results are projected in the session-format-V4 shape. V4 carries a tool result as a first-class `role: 'tool'` message (top-level `toolCallId` + `content` + optional `isError`), and `'tool-result'` is no longer a member of the host's `ContentBlockMap` — so `src/project.ts` failed to compile on the 0.1.7 line with `TS2678: Type '"tool-result"' is not comparable to type '"text" | "reasoning" | "image" | "file" | "tool-call" | "tool-addition" | "tool-removal"'`. The failure marker now comes from the MESSAGE (`projectToolMessage`); projecting `content` alone would silently report a failed tool as a successful one. Verified by mutation: reverting the tool-span call site to the content-only projection turns the new `collector.spec.ts` case red.
- A pre-upgrade (V3) session log still projects its tool-result text through `isRetiredToolResultWrapper`, an explicitly READ-ONLY compatibility path. The retired wrapper never had a persisted `isError` flag (the V3 migration rejects it), so a V3 row now projects without an invented `[error]` marker rather than fabricating one. This plugin writes no messages and no content blocks, so there is no write-side migration; the host rejects the retired wrapper at physical-row admission (`assertV4ToolResultMessage`).
- The `createSystemMessage` call in the collector suite drops its removed second argument: host 0.1.7 narrowed the signature to `(text)` with the source fixed to `{ kind: 'system-prompt' }`.

### Changed

- The dev/test `@deepseek-ai/dsh-*` dependencies move to the `0.1.7-alpha.1` line (= the verified host tag `dsh-v0.1.7-alpha.1`), together with `@deepseek-ai/cordis` `^4.0.3` and `@deepseek-ai/schemastery` `^3.18.3`; `pnpm-workspace.yaml` pins `@deepseek-ai/cordis` 4.0.3, `@deepseek-ai/cosmokit` 1.8.4 and `@deepseek-ai/schemastery` 3.18.3 (bare peer edges; `Volatile` needs cordis 4.0.3+), and carries self-referential `overrides` rows for every `@deepseek-ai/dsh-*` devDep pin so the host type graph resolves to exactly one copy.
- The peer range and `engines.dsh` gain a fourth clause, `|| >=0.1.7-0 <0.2.0`. The previous three-clause range excluded the target host itself: semver's prerelease rule does not let `>=0.1.6-0` admit `0.1.7-alpha.1`, so a correctly-pinned 0.1.7 install was reported as unsatisfied.
- `@deepseek-ai/cordis-plugin-loader` is held at **1.0.3** (an `overrides` row) even though cordis 4.0.3 declares `^1.0.4` as an optional peer. On 1.0.4 `Entry._init()` catches an import/apply failure and merely calls `ctx.logger.error(error)` before returning, and cordis's LoggerService writes to no exporter by default — so `Tree.await()` stops rethrowing, a row whose config fails to parse becomes a silent unmount, and the composition suite loses the failure reason it asserts. Measured 2026-09-22: on 1.0.4 both negative composition cases degraded to the runner's own generic "no OTLP /v1/traces export was issued"; forcing 1.0.3 restored all six with no source change.

## [0.2.14] - 2026-09-19

### Added

- `pnpm run check:lockfile` (`scripts/check-lockfile-drift.mjs`) fails fast when `package.json` and `pnpm-lock.yaml` disagree; the probe is read-only and the documented checks chain runs it alongside the other gates.

### Changed

- The release workflow now publishes through **npm trusted publishing** (OIDC) instead of the long-lived `NPM_TOKEN` secret: `setup-node` no longer sets `registry-url` (its empty `_authToken` line made the registry answer 404 on PUT), npm is upgraded to >= 11.5.1 before publishing, and the "NPM_TOKEN is not set -> skip" guard is gone so a missing publisher cannot turn a release into a silent no-op.
## [0.2.13] - 2026-09-18

### Added

- `dsh.manifestVersion: 1` and the canonical three-clause `engines.dsh` range, matching the 0.1.6 family contract.
- An optional diagnostics outlet: when the experimental `inspector` service is composed, every recorded metric is also published (`observe.metric`). The service is read structurally and never injected, a missing service is a silent no-op, and a throwing service cannot break the export path — the OTLP sink stays the primary outlet.
- A ruler-liveness canary (`tsconfig.canary.json` + `scripts/ruler-canary.ts` + `pnpm run check:ruler-live`): the canary references constructs that exist only on the older alpha.1/rc.2 type line, so a green compile means the typecheck ruler is measuring a stale face. CI now runs both rulers plus the canary.

### Fixed

- Strict Typert wire codecs now carry both faces — the published `schema` field and the checkout `create()` factory. The 0.1.6-alpha.2 loader requires `create()`, so the build failed on that line with `Property 'create' is missing`; the codec is built through a variable so neither typecheck ruler flags the other face's field as excess.
- Mounting no longer dies when the durable offline buffer cannot open. `storageDomain` is single-open per name, so a hot reload racing the previous instance's close made the second `open` reject and the whole exporter failed to mount; the open is now wrapped, the degradation warns once, and the exporter keeps delivering through the in-memory queue.
- The `session/event`, `session/flush`, and `session/disposed` listeners are registered inside the teardown effect (with the timers, the final pipeline flush, and the domain close), so a mid-apply disposal can no longer throw `INACTIVE_EFFECT` or leave the collector writing after unmount.
- Prompt capture reads the projected model-visible history (`Session.deriveMessages()`) instead of the deprecated synchronous event snapshot; hosts without that accessor contribute the logged header only, which is what their pre-0.1.5 logs carried anyway.

### Changed

- The dev/test `@deepseek-ai/dsh-*` dependencies move to the `0.1.6-alpha.2` line so the primary typecheck ruler measures the new type face; `typecheck:ci` keeps measuring the published line.

## [0.2.12] - 2026-09-12

### Changed

- Rename the four translated READMEs to `README-<lang>.md`. npm selects the package-page readme as the first markdown file matching its `{README,README.*}` glob (`@npmcli/package-json`, publish path), and that glob order puts `README.<lang>.md` ahead of `README.md` — so npm was serving the Simplified-Chinese file for this package too (measured on 15/15 sampled packages of the family). The new names sit outside the glob, so the English source is served again. No content changed apart from the language-switcher link each translation holds to its siblings, and the repo readme gate still passes. Takes effect with the next release; an already-published version cannot gain a corrected readme retroactively.
- Pin the `@deepseek-ai/dsh-*` dev/test dependencies to the published `0.1.5-rc.2` line and record `0.1.5-rc.2` in `dshWorkshop.compatibility.dshVersions`; the monthly Compat workflow now runs against `0.1.5-rc.2`. The peer range `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0` is unchanged, so no supported host line is dropped.

## [0.2.11] - 2026-09-10

### Changed

- Pin the `@deepseek-ai/dsh-*` dev/test dependencies to the published `0.1.5-rc.1` line and record `0.1.5-rc.1` in `dshWorkshop.compatibility.dshVersions`; the monthly Compat workflow now runs against `0.1.5-rc.1`. The peer range `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0` is unchanged, so no supported host line is dropped.

### Docs

- Refresh the five-language README compatibility baseline to `dsh-v0.1.5-rc.1` (verified 2026-09-10).


## [0.2.10] - 2026-09-09

### Fixed

- Adapt the collector to the host 0.1.5 session event vocabulary: `assistant/chunk` was removed from `SessionEventMap` (host commit `f99b06eaed`) and `EpochHeader.system` was removed (host commit `ee956c720d`). Finish reason and first-token timing now come from the required `assistant/message.stream` and the new `assistant/attempt.stream`; the system prompt is read from surface node 0 (`system/message`) instead of the header. The published `0.1.2-rc.1` runtime line keeps working through structural reads of the legacy `assistant/chunk` events and the legacy `header.system` field.
- Read `assistant/attempt.stream`, so a failed, cancelled, or stream-errored attempt that commits no message still contributes the dangling LLM span's finish reason instead of leaving it empty.

### Changed

- Pin the devDependencies and the CI/compat probes to `@deepseek-ai/dsh@0.1.5-alpha.1`; the peer range stays the composite `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0`, and `dshWorkshop.compatibility.dshVersions` lists both baselines.
- Rewrite the collector fixtures to the V3 event shapes (embedded streams, `system/message` as surface node 0) and add coverage for the legacy rc.1 chunk fallback and the failed-attempt stream: 124 tests across 18 suites.

### Docs

- Refresh the five-language README compatibility sections: harness `dsh-v0.1.5-alpha.1` verified 2026-09-09, devDeps `0.1.5-alpha.1`, the composite peer range, and the corrected typecheck/test-count lines; align AGENTS.md with the 0.1.5 seams.

## [0.2.9] - 2026-09-07

### Docs

- Fix the DSH plugin badge URL: shields.io rejects the four-segment static badge form with "404 badge not found"; the label now uses the documented double-dash form (`dsh--plugin`), rendering identically; no behavior change.

## [0.2.8] - 2026-09-07

### Fixed

- Align the `@deepseek-ai/dsh-*` peer ranges to `>=0.1.2-rc.1 <0.2.0`: the older `>=0.1.0-rc.8 <0.2.0` band resolved to only the `0.1.0-rc.8` prerelease under registry-driven resolution and broke fresh tarball installs; no behavior change.

### Docs

- Refresh the five-language README support-version wording: the verified GitHub tag `dsh-v0.1.3-alpha.1` now leads the compatibility claim, while npm `0.1.2-rc.1` stays the published dependency-pin line (peers `>=0.1.2-rc.1 <0.2.0`); no behavior change.


## [0.2.7] - 2026-09-04

### Fixed

- Remove the `storage` / `storage-json` / `storage-domain` rows from the bundle patch: the shipped profiles compose that stack through `dsh-base`, so the inserted rows collided with the same ids and made the profile refuse to boot (`duplicate loader entry id: storage`). The patch now mounts only the plugin row; bare profiles compose the storage stack themselves.

## [0.2.6] - 2026-09-04

### Fixed

- Recover the LLM span finish reason and first-token timing from the v2 embedded `assistant/message` stream that the 0.1.3-alpha.1 host ships instead of `assistant/chunk` events; the legacy chunk path stays as the published-line fallback. No behavior change on the published 0.1.2-rc.1 line.

## [0.2.5] - 2026-09-04

### Changed

- Align the devDependency pins to the published dsh `0.1.2-rc.1` line, move the compat CI probes from `0.1.1-rc.2` to `0.1.2-rc.1`, and refresh the stale peer references in AGENTS.md/READMEs; no behavior change.

## [0.2.4] - 2026-09-02

### Docs

- Sync the five-language READMEs to the 0.1.2-alpha.5 facts; no behavior change.

## [0.2.3] - 2026-09-02

### Changed

- Align the devDependency pins to the published dsh 0.1.2-alpha.5 line and re-verify the adaptation claims; no behavior change.

## [0.2.2] - 2026-09-01

### Changed

- Align the devDependency pins to the published dsh `0.1.2-alpha.3` line (7 `@deepseek-ai/dsh-*` packages) and align `cordis`/`schemastery` to `^4.0.2`/`^3.18.2`. No behavior change; the five-language READMEs record the alpha.3 fact.

## [0.2.1] - 2026-08-30

### Fixed

- First-token detection on `assistant/chunk` no longer imports the removed `isTokenDelta` from `@deepseek-ai/dsh-llm/message`: host 0.1.2-alpha.1 deleted that export, so the plugin now carries a local replication of the rc.2 semantics (non-empty text/reasoning/tool deltas count; empty deltas and non-delta chunks do not). The host chunk grammar is unchanged, so both rulers behave identically.

### Changed

- Test call-id fixtures derive the brand from the `dsh-session` `tool/call` event payload instead of importing the dsh-llm `CallId` brand (renamed `ToolCallId` on the host checkout).
- `AGENTS.md` records the measured tsconfig setup: no checkout `paths`; `typecheck` and `typecheck:ci` both resolve the published 0.1.1-rc.2 peers.

## [0.2.0] - 2026-08-26

### Changed

- Align OTLP LLM spans to the `gen_ai.*` semantic conventions.

## [0.1.5] - 2026-08-23

## [0.1.4] - 2026-08-22

### Changed

- Upgraded the `@deepseek-ai/dsh-*` dependency family from `0.1.0-rc.8` to `0.1.1-rc.2` (`dsh-llm`, `dsh-session`, `dsh-storage`, `dsh-storage-domain`, `dsh-storage-json`, `dsh-typert-protocol`); the plugin now ships against the rc.2 harness baseline.

## [0.1.3] - 2026-08-22

### Added

- `langfuse.traceName` (default `session {session} turn {turn}`, placeholders interpolated per trace) and `langfuse.tags` (default `[]`) config fields: the Langfuse trace-create event now renders the configured name template and stamps the configured tags, so hosts sharing one Langfuse project with other agents can filter their traces (issue #2).

## [0.1.2] - 2026-08-21

### Changed

- Upgraded the `@deepseek-ai/dsh-*` dependency family from `0.1.0-rc.6` to `0.1.0-rc.8` (`dsh-llm`, `dsh-session`, `dsh-storage`, `dsh-storage-domain`, `dsh-storage-json`, `dsh-typert-protocol`); peer ranges now span `>=0.1.0-rc.8 <0.2.0` so the plugin ships against the rc.8 harness baseline.

## [0.1.1] - 2026-08-17

### Fixed

- The bundle patch now composes the storage stack (`@deepseek-ai/dsh-storage` + `dsh-storage-json` + `dsh-storage-domain`) and declares all three packages, so a bare profile gets the `storageDomain` service the plugin injects instead of hanging with `pending (waiting for service: storageDomain)`.

## [0.1.0] - 2026-08-16

### Added

- OpenTelemetry OTLP/HTTP and Langfuse export backends over the `session/event` stream: turn/step/tool/LLM spans, token and cost metrics, and sanitized LLM prompt/completion capture.
- Async batching with size- and timer-triggered flushes, a bounded durable offline buffer (storage-domain spool) with oldest-first eviction, and deterministic exponential-backoff retries.
- Pre-send sanitization layer: structural key-name redaction, built-in and configurable secret patterns, and per-surface character budgets.
- Optional Typert remote surface (`observe/status`, `observe/setEnabled`) with a runtime kill switch.
- Off-by-default mounting: `enabled: true` plus at least one backend is an explicit opt-in.

### Changed

- Config schema migrated to the current Schemastery API (`z.union([…, z.const(null)])` backends, explicit full-object defaults).

### Fixed

- Deterministic id digests now separate numeric and string structural parts (no `1`/`'1'` collisions).
- Langfuse batches emit exactly one `trace-create` per trace even when one batch carries several spans of the same trace.
