# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
