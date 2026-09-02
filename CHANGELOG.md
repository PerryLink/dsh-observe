# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
