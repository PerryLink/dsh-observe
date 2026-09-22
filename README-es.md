<div align="center">

# 📊 dsh-observe
- **Canal 1024 store**: `npm i -g dsh1024` una vez, luego `dsh1024 plugin --profile web add dsh-observe` (cuenta para el ranking de instalaciones de [deepseek1024.com](https://deepseek1024.com)).

**Exportador de observabilidad OpenTelemetry y Langfuse para DeepSeek Harness.**

*Convierte los eventos de sesión en trazas OTLP y observaciones de Langfuse — saneado, con buffer y apagado por defecto.*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-observe)
[![DSH plugin](https://img.shields.io/badge/dsh--plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![dsh-doctor](https://raw.githubusercontent.com/PerryLink/dsh-plugin-doctor/main/badges/PerryLink__dsh-observe.svg)](https://github.com/PerryLink/dsh-plugin-doctor#verified-徽章)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-brightgreen.svg)](#)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-observe/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-observe/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-observe?label=version)](https://github.com/PerryLink/dsh-observe/releases)
[![npm version](https://img.shields.io/npm/v/dsh-observe)](https://www.npmjs.com/package/dsh-observe)
[![npm downloads](https://img.shields.io/npm/dm/dsh-observe)](https://www.npmjs.com/package/dsh-observe)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

</div>

---

## Compatibility

| Superficie | Estado |
|---|---|
| Harness | DeepSeek Harness `dsh-v0.1.7-alpha.1` (adaptado el 2026-09-22): el formato de sesión V4 representa el resultado de una herramienta como un mensaje de primera clase `role: 'tool'` con `toolCallId` + `content` + `isError` opcional en el nivel superior — el bloque de contenido `tool-result` de V3 ya no está en el `ContentBlockMap` del host, y este plugin solo lee la forma V4 (un log V3 anterior a la actualización todavía se proyecta mediante una ruta de compatibilidad de solo lectura). Los demás rasgos del formato de sesión V3 se mantienen: el flujo del asistente se incorpora en `assistant/message` / `assistant/attempt` y el prompt de sistema es el nodo 0 de la superficie (`system/message`); el plugin consume solo el flujo de eventos en vivo y nunca lee archivos de log de sesión. El rango de peers `>=0.1.2-rc.1 <0.2.0 \|\| >=0.1.5-alpha.1 <0.2.0 \|\| >=0.1.6-0 <0.2.0 \|\| >=0.1.7-0 <0.2.0` mantiene instalable cada línea publicada (cadena completa de puertas local; el workflow compat cubre el smoke de instalación de perfil). |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Backends | OpenTelemetry OTLP/HTTP (traces + metrics, codificación JSON) y Langfuse (observabilidad de LLM) — uno o ambos |
| Modelo | Independiente del modelo: exporta el flujo `session/event`; no realiza llamadas a modelos |

## What you get

`dsh-observe` convierte el flujo `session/event` del harness en protocolos estándar de observabilidad:

- **Spans** — spans de turno, paso, llamada a herramienta (duración, estado, derivación de reintentos) y generación de LLM, enlazados en trazas por turno con ids deterministas.
- **Metrics** — contadores de tokens por provider/modelo, contadores de coste en USD (tabla de precios configurable) y el gauge opcional de presión de contexto desde `ctx.tokenMeter`.
- **Captura saneada** — los cuerpos de prompt y completion se redactan (nombres de clave estructurales + patrones de secretos integrados + tus patrones) y se truncan antes de encolar o enviar nada.
- **Fiabilidad** — lotes asíncronos (por tamaño y por temporizador), un buffer offline duradero y acotado (storage-domain) con desalojo del más antiguo, y reintentos con backoff exponencial determinista; los lotes no entregados sobreviven a reinicios.
- **Interruptor en tiempo de ejecución** — el Typert remote opcional (`observe/status`, `observe/setEnabled`) permite a una página de ajustes detener y reanudar la exportación sin desmontar.
- **Apagado por defecto** — `enabled: true` más al menos un backend es la adhesión explícita; de lo contrario no se captura ni se exporta nada.

```text
flujo session/event
   │ collector (spans de turno/paso/herramienta/LLM, métricas)
   │ sanitize (claves, secretos, presupuestos)
   ├──▶ pipeline "otlp"  ── cola ── flush ──▶ OTLP /v1/traces + /v1/metrics
   │         └─ reintento/backoff ─┐
   ├──▶ pipeline "langfuse" ── cola ── flush ──▶ ingesta de Langfuse
   │         └─ reintento/backoff ─┤
   └────────── spool duradero (buffer offline, acotado) ◀┘
```

## Quick start

```sh
# 1. instala el bundle en tu perfil
dsh plugin --profile web add "github:PerryLink/dsh-observe#main"

# o desde npm (versiones publicadas)
dsh plugin --profile web add dsh-observe

# 2. configura un backend en el parche de tu perfil (cordis.yml) y reinicia
dsh --profile web
```

Configuración OTLP mínima (la fila viene comentada en `cordis.patch.yml`):

```yaml
- insert:
    - id: dsh-observe
      name: dsh-observe
      config:
        enabled: true
        otlp:
          endpoint: http://localhost:4318
```

Luego verifica que la fila monta:

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-observe'
```

## Install & uninstall

- **Canal git** (último `main`): `dsh plugin --profile web add "github:PerryLink/dsh-observe#main"` — el script `prepare` compila solo con dependencias de producción.
- **Canal npm** (versiones publicadas): `dsh plugin --profile web add dsh-observe`.
- **Canal tarball**: `pnpm pack` en este repositorio y luego `dsh plugin --profile web add ./dsh-observe-<version>.tgz`.
- **Desinstalar**: `dsh plugin --profile web remove dsh-observe` (o elimina la fila del parche del perfil).

> Si pnpm informa `ERR_PNPM_IGNORED_BUILDS` para este paquete (la validación inofensiva del binario de plataforma de esbuild), añade `allowBuilds: { esbuild: true }` a tu `pnpm-workspace.yaml` — el CLI `dsh` imprime el fragmento exacto.

## Configuration

Todos los ajustes son campos `Config` de Schemastery (modificables desde cordis.yml). Una sobrescritura dirigida por id reemplaza toda la fila — vuelve a declarar cada clave que necesites. `cordis.patch.yml` documenta cada clave en línea.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Interruptor maestro; `true` más al menos un backend es la adhesión explícita |
| `otlp` | `null` | Configuración del backend OTLP, o `null` para desactivarlo |
| `otlp.endpoint` | *(obligatorio)* | URL base de OTLP; `/v1/traces` y `/v1/metrics` se añaden |
| `otlp.serviceName` | `deepseek-harness` | Atributo de recurso `service.name` |
| `otlp.serviceVersion` | *(ninguno)* | Atributo de recurso `service.version` |
| `otlp.headers` | `{}` | Cabeceras extra fusionadas en cada petición de exportación |
| `otlp.timeoutMs` | `10000` | Tiempo de espera por petición |
| `langfuse` | `null` | Configuración del backend Langfuse, o `null` para desactivarlo |
| `langfuse.baseUrl` | `https://cloud.langfuse.com` | URL base de Langfuse |
| `langfuse.publicKey` | *(obligatorio)* | Clave pública del proyecto |
| `langfuse.secretKey` | *(obligatorio)* | Clave secreta del proyecto |
| `langfuse.release` | *(ninguno)* | Etiqueta release estampada en las trazas |
| `langfuse.traceName` | `session {session} turn {turn}` | Plantilla del nombre de traza; `{session}`/`{turn}` se interpolan por traza |
| `langfuse.tags` | `[]` | Etiquetas estáticas estampadas en cada traza |
| `langfuse.timeoutMs` | `10000` | Tiempo de espera por petición |
| `capture.turns` | `true` | Spans de ciclo de vida del turno |
| `capture.steps` | `true` | Spans de ciclo de vida del paso |
| `capture.tools` | `true` | Spans de llamada a herramienta con argumentos/resultados saneados |
| `capture.llm` | `true` | Spans de generación de LLM |
| `llm.prompt` | `true` | Captura el prompt de petición saneado (`false` = solo tamaños) |
| `llm.completion` | `true` | Captura la completion saneada (`false` = solo tamaños) |
| `metadata.sessionId` | `true` | Atributo de id de sesión |
| `metadata.cwd` | `false` | Directorio de trabajo de la sesión (una ruta local — apagado por defecto) |
| `metadata.agentPreset` | `true` | Atributo de id del agent preset |
| `metadata.model` | `true` | Atributos de provider/modelo |
| `metrics.tokens` | `true` | Contadores de tokens por provider/modelo |
| `metrics.cost` | `true` | Contadores de coste en USD (necesitan reglas `pricing` que coincidan) |
| `metrics.contextTokens` | `true` | Gauge de presión de contexto (necesita `ctx.tokenMeter`) |
| `pricing` | `[]` | Tabla de precios, primera coincidencia gana: `{ provider?, model, inputPerToken, outputPerToken, cacheReadPerToken?, cacheWritePerToken? }` |
| `sanitize.enabled` | `true` | Interruptor maestro de redacción (`false` desactiva la redacción, nunca el truncado) |
| `sanitize.redactKeys` | `[]` | Subcadenas de nombre de clave extra (key/token/secret/password/authorization/credential/apiKey siempre se incluyen) |
| `sanitize.redactPatterns` | `[]` | Expresiones regulares de secretos extra |
| `sanitize.truncatePromptChars` | `4000` | Presupuesto de caracteres del prompt |
| `sanitize.truncateCompletionChars` | `4000` | Presupuesto de caracteres de la completion |
| `sanitize.truncateToolInputChars` | `2000` | Presupuesto de caracteres de los argumentos de herramienta |
| `sanitize.truncateToolOutputChars` | `2000` | Presupuesto de caracteres del resultado de herramienta |
| `sanitize.truncateAttributeChars` | `512` | Presupuesto de cadenas de atributos de span |
| `batch.maxRecords` | `256` | Flush cuando la cola alcanza este número de registros |
| `batch.flushIntervalMs` | `5000` | Intervalo de flush por temporizador |
| `batch.maxQueueRecords` | `2000` | Límite de la cola en memoria; el exceso se derrama al buffer |
| `batch.maxBufferRecords` | `10000` | Límite del buffer offline duradero; los registros más antiguos caen primero |
| `batch.bufferRetryIntervalMs` | `30000` | Intervalo de reintento del buffer offline |
| `retry.maxAttempts` | `5` | Intentos por lote, incluido el primero |
| `retry.baseDelayMs` | `1000` | Primer retardo de backoff |
| `retry.factor` | `2` | Multiplicador de backoff por fallo consecutivo |
| `retry.maxDelayMs` | `60000` | Techo de backoff |
| `remote.enabled` | `false` | Monta el Typert remote `observe` (interruptor) |

## Tools & surfaces

Este plugin **no registra herramientas de modelo** — es un exportador en segundo plano. Sus superficies:

- **Consume** `session/event` (recolección de spans/métricas), `session/flush` (impulso de exportación best-effort — el checkpoint de durabilidad nunca espera a un backend remoto) y `session/disposed`.
- **Servicio remote opcional** `observe` — `observe/status` devuelve el estado del interruptor, los backends configurados, la profundidad de cola y la ocupación del buffer; `observe/setEnabled` detiene y reanuda la exportación en tiempo de ejecución.

## Permissions & data

- **Permisos**: `network:outbound` hacia los endpoints que configures, `session:read` para el flujo de eventos, `storage:write` para el buffer offline; sin código nativo, sin acceso al sistema de archivos.
- **Datos**: todo lo enviado se deriva del registro de sesión y se sanea (redacción + truncado) antes de encolarse, almacenarse o transmitirse. El buffer offline solo guarda registros saneados, re-validados al leerlos.
- **Credenciales**: las claves pública/secreta de Langfuse viajan solo al endpoint de Langfuse configurado; las cabeceras OTLP solo al endpoint OTLP configurado. El plugin no almacena credenciales — guárdalas en referencias de credenciales o valores inyectados por entorno.

## Security boundaries

- **Apagado por defecto** — nada se captura ni se exporta salvo adhesión explícita.
- **Sanear antes de enviar** — redacción estructural de claves, patrones de secretos integrados (claves de API, tokens de GitHub, claves de AWS, credenciales bearer, claves privadas), tus patrones y presupuestos de caracteres se aplican antes de que un registro salga de memoria.
- **Re-validación en el límite duradero** — los registros leídos del almacenamiento se comprueban de nuevo antes de que un sink pueda verlos.
- **Fallo ruidoso, fallo contenido** — los fallos de exportación avisan, cuentan, reintentan y finalmente se guardan en el spool; un manejador de sesión que falla se captura y registra, de modo que la observabilidad nunca puede romper la ruta caliente del harness.
- **Model-visible ⟺ logged** — las exportaciones de prompt/completion proyectan solo la superficie de sesión (cuyo nodo 0 es el prompt de sistema) y la cabecera registrada (configuración de llamada y herramientas); el exportador no inventa contenido.

## Known limitations

- **npm 0.1.7-alpha.1** — el plugin se desarrolla y prueba contra `@deepseek-ai/dsh@0.1.7-alpha.1` (devDeps y la regla primaria de CI); el rango de peers `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-0 <0.2.0 || >=0.1.7-0 <0.2.0` mantiene instalable cada línea publicada, y la segunda regla (`typecheck:ci`) más el workflow compat cubren los baselines antiguos.
- **Los eventos de auditoría no se persisten** — los registros `observe/*` del propio exportador son solo de auditoría: en la línea de host actual la puerta de append de sesión admite eventos de superficie, así que ningún evento `observe/*` se escribe en el log de sesión, y el plugin no lo falsifica con un append sin marcar (eso volvería ilegibles las sesiones). Usa la salida de estado de `/observe` y los backends OTLP/Langfuse como superficie de auditoría.
- **Las métricas evitan la ruta de reintento/spool** — las métricas OTLP se agregan de forma acumulativa, así que un flush perdido se autocura en el siguiente (por diseño, no es un fallo).
- **Sin muestreo** — toda familia de spans habilitada se exporta; ajusta los interruptores `capture.*` y `batch.maxBufferRecords` para sesiones de alto volumen.

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc: src + tests contra los devDeps 0.1.7-alpha.1 (sin tsconfig paths)
pnpm run typecheck:ci  # tsc contra la línea publicada (sin paths)
pnpm run check:ruler-live  # canario: debe fallar al compilar, probando que la regla sigue viva
pnpm test           # vitest: 126 tests, 18 suites (Context/Session/storage seam reales)
pnpm run test:coverage  # puerta de cobertura (90/80/90/90)
pnpm run build      # bundle tsdown + declaraciones tsc (lib/)
pnpm run verify:self-contained  # las especificaciones de dependencias resuelven desde el registry
pnpm run verify:artifacts       # cara ESM construida + bundle patch presentes
node scripts/check-readme-sync.mjs  # puerta de sincronía de los cinco READMEs
pnpm pack           # el tarball publicado
```

## Topics

`dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing`

## Contributors

- [@PerryLink](https://github.com/PerryLink) — creador y mantenedor: collector, pipelines, spool, sinks OTLP/Langfuse, saneamiento y la documentación en cinco idiomas.

## PerryLink DSH Plugin Family

This project is one of the **45 DeepSeek Harness plugins** maintained by [PerryLink](https://github.com/PerryLink). If this one helps you, the others likely will too:

| Plugin | One-liner |
|---|---|
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default | |
| **[dsh-autotier](https://github.com/PerryLink/dsh-autotier)** | Automatic strong/cheap model-tier routing with deterministic risk guards and a `/tier` command | |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | |
| **[dsh-catalog](https://github.com/PerryLink/dsh-catalog)** | DSH Desktop Market standard catalog source for the PerryLink family | |
| **[dsh-cert-mcp](https://github.com/PerryLink/dsh-cert-mcp)** | Read-only MCP server exposing the certification registry: grades, snapshots and five-dimension evidence | |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind-equivalent: snapshots, session forks, one-shot restore | |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | Migrate Claude Code sessions, memory, skills and CLAUDE.md into DSH | |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | Cross-platform native desktop control for DeepSeek Harness — Windows first. | |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | Terminal-style input history for the web composer: arrows, Ctrl+R search | |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | Dataset quality checks and citation cross-checks (the optional numeric bridge consumed here) | |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | Prompt-injection, jailbreak, and secret-leak defense for DeepSeek Harness. | |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | Engineering-discipline guard: requirements grill, test gates, adversary review | |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | Unified static-image generation routing for DeepSeek Harness. | |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** | Read-only performance diagnostics for DeepSeek Harness. | |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** | Deterministic research reports for Chinese public mutual funds | |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** | GitHub PR/issues integration for DSH, every write gated by approval | |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** | Industry research orchestration that seals its deliverables through this plugin's `ctx.researchReport.assemble` | |
| **[dsh-laya](https://github.com/PerryLink/dsh-laya)** | Laya typed decisions (`noul`/`choice`/`score`) as a first-class Cordis service and model-visible tools | |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | Local document knowledge base for DeepSeek Harness. | |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | Local-model (Ollama) integration for DeepSeek Harness. | |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | LSP diagnostics, formatting, completion, code actions and rename over language servers | |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII masking middleware: anonymize at the model boundary, restore at the display layer | |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | Read-only MCP runtime panel: /mcp command + Settings tab with status, tools and errors | |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | Approval-gated cross-session memory: ctx.memory seam + SQLite + memory tool | |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | OpenTelemetry and Langfuse observability exporter for DeepSeek Harness. | |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles-equivalent runtime style switching | |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | Claude Code-style declarative allow/deny/ask permission rules with audit | |
| **[dsh-plugin-certification](https://github.com/PerryLink/dsh-plugin-certification)** | Community certification registry with repro-checkable grades and badges | |
| **[dsh-plugin-doctor](https://github.com/PerryLink/dsh-plugin-doctor)** | Zero-dependency static + sandbox smoke detector for DSH plugins | |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | Plugin-development knowledge base as an on-demand agent skill | |
| **[dsh-plugin-kit](https://github.com/PerryLink/dsh-plugin-kit)** | Shared zero-runtime-dependency toolkit for the PerryLink DSH plugins | |
| **[dsh-plugin-upgrade](https://github.com/PerryLink/dsh-plugin-upgrade)** | One-package, one-corridor-index plugin upgrade skill: routes a repository to the matching closed corridor card | |
| **[dsh-plugin-upgrade-015](https://github.com/PerryLink/dsh-plugin-upgrade-015)** | Merged `0.1.3-alpha.1` → `0.1.5-rc.1` upgrade corridor card plus a zero-dependency seam scanner | |
| **[dsh-reach](https://github.com/PerryLink/dsh-reach)** | Multi-channel approval/question bridge: WeChat/Telegram/Feishu, session console | |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions | |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. | |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. | |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review | |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. | |
| **[dsh-team-rooms](https://github.com/PerryLink/dsh-team-rooms)** | Cross-session team rooms: shared message bus, task board and timeline | |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | Isolated install-and-smoke test drives for DeepSeek Harness plugins. | |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/Dida365 task bridge: session-header panel + 11 tools | |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | Vendor parameter translation and deterministic JSON repair for DeepSeek Harness. | |


## License

[Apache License 2.0](LICENSE) © 2026 dsh-observe contributors

### Instalar desde el mercado de DSH Desktop

Todos los plugins de PerryLink pueden explorarse en el mercado integrado de DSH Desktop: **Market → Sources → add source → pegar** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ seleccionarlo**. La instalación sigue pasando por la verificación de identidad npm del mercado y tu confirmación.
