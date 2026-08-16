# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately through GitHub's private vulnerability reporting:

**https://github.com/PerryLink/dsh-observe/security/advisories/new**

That flow keeps the report confidential while we triage, and it is the channel we watch first.

## Before you report

- **Redact sensitive data** from any logs, session excerpts, or exported payloads you attach: tokens, API keys, secrets, Authorization/request headers, personal paths, and account identifiers. Trimmed stack traces and redacted payload samples are usually enough.
- Include, when possible: the plugin version, the harness (`dsh`) version, Node and OS versions, the backend (OTLP/Langfuse) you use, and the minimal steps to reproduce.

## What to expect

- **Acknowledgment**: within 5 business days.
- **Triage**: within 10 business days we confirm the issue and assess severity, or ask for more details.
- **Fix**: security fixes are prepared in a private fork, released as a patch version, and announced in the release notes.

## Disclosure and credit

- We follow coordinated disclosure: a public advisory (and CVE request where appropriate) is published once a fix ships.
- Reporters are credited in the advisory unless they ask to remain anonymous. There is no bug bounty program at this time.

## Scope

This plugin exports session telemetry to observability backends that **you** configure. Its own guarantees are:

- **Off by default** — `enabled: true` plus at least one backend is an explicit opt-in; nothing is captured or exported otherwise.
- **Sanitize before send** — structural key-name redaction, built-in secret patterns (API keys, GitHub tokens, AWS keys, bearer credentials, private keys), your additional patterns, and per-surface character budgets run before anything is queued, buffered, or sent. `sanitize.enabled: false` is an explicit degradation that only disables redaction, not truncation.
- **Credential handling** — the Langfuse public/secret keys are sent only to the configured Langfuse endpoint (Basic auth), and OTLP headers only to the configured OTLP endpoint. The plugin stores no credentials itself; keep them in credential references or environment-injected profile values.
- **Durable buffer** — undeliverable batches spill to the harness's storage domain; every stored record is re-validated at the durable boundary before it can reach a sink.

Vulnerabilities in the harness itself should be reported to the official harness maintainers instead.
