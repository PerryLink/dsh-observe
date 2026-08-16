# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
