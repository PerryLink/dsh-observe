<div align="center">

# 📊 dsh-observe

**Exportador de observabilidade OpenTelemetry e Langfuse para o DeepSeek Harness.**

*Transforme eventos de sessão em traces OTLP e observações Langfuse — saneados, com buffer e desligados por padrão.*

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

| Superfície | Status |
|---|---|
| Harness | DeepSeek Harness `0.1.0-rc.8` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Backends | OpenTelemetry OTLP/HTTP (traces + metrics, codificação JSON) e Langfuse (observabilidade de LLM) — um ou ambos |
| Modelo | Independente de modelo: exporta o fluxo `session/event`; não faz chamadas a modelos |

## What you get

O `dsh-observe` transforma o fluxo `session/event` do harness em protocolos padrão de observabilidade:

- **Spans** — spans de turno, passo, chamada de ferramenta (duração, status, derivação de tentativas) e geração de LLM, ligados em traces por turno com ids deterministas.
- **Metrics** — contadores de tokens por provider/modelo, contadores de custo em USD (tabela de preços configurável) e o gauge opcional de pressão de contexto via `ctx.tokenMeter`.
- **Captura saneada** — corpos de prompt e completion são redigidos (nomes de chave estruturais + padrões de segredos embutidos + seus padrões) e truncados antes de qualquer enfileiramento ou envio.
- **Confiabilidade** — lotes assíncronos (por tamanho e por temporizador), um buffer offline durável e limitado (storage-domain) com despejo do mais antigo, e tentativas com backoff exponencial determinista; lotes não entregues sobrevivem a reinícios.
- **Interruptor em tempo de execução** — o Typert remote opcional (`observe/status`, `observe/setEnabled`) permite a uma página de ajustes parar e retomar a exportação sem desmontar.
- **Desligado por padrão** — `enabled: true` mais ao menos um backend é a adesão explícita; caso contrário, nada é capturado ou exportado.

```text
fluxo session/event
   │ collector (spans de turno/passo/ferramenta/LLM, métricas)
   │ sanitize (chaves, segredos, orçamentos)
   ├──▶ pipeline "otlp"  ── fila ── flush ──▶ OTLP /v1/traces + /v1/metrics
   │         └─ tentativa/backoff ─┐
   ├──▶ pipeline "langfuse" ── fila ── flush ──▶ ingestão Langfuse
   │         └─ tentativa/backoff ─┤
   └────────── spool durável (buffer offline, limitado) ◀┘
```

## Quick start

```sh
# 1. instale o bundle no seu perfil
dsh plugin --profile web add "github:PerryLink/dsh-observe#main"

# ou pelo npm (versões publicadas)
dsh plugin --profile web add dsh-observe

# 2. configure um backend no patch do seu perfil (cordis.yml) e reinicie
dsh --profile web
```

Configuração OTLP mínima (a linha vem comentada em `cordis.patch.yml`):

```yaml
- insert:
    - id: dsh-observe
      name: dsh-observe
      config:
        enabled: true
        otlp:
          endpoint: http://localhost:4318
```

Depois verifique que a linha monta:

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-observe'
```

## Install & uninstall

- **Canal git** (último `main`): `dsh plugin --profile web add "github:PerryLink/dsh-observe#main"` — o script `prepare` compila apenas com dependências de produção.
- **Canal npm** (versões publicadas): `dsh plugin --profile web add dsh-observe`.
- **Canal tarball**: `pnpm pack` neste repositório e então `dsh plugin --profile web add ./dsh-observe-<version>.tgz`.
- **Desinstalar**: `dsh plugin --profile web remove dsh-observe` (ou remova a linha do patch do perfil).

> Se o pnpm reportar `ERR_PNPM_IGNORED_BUILDS` para este pacote (a validação inofensiva do binário de plataforma do esbuild), adicione `allowBuilds: { esbuild: true }` ao seu `pnpm-workspace.yaml` — o CLI `dsh` imprime o trecho exato.

## Configuration

Todos os ajustes são campos `Config` do Schemastery (alteráveis pelo cordis.yml). Uma sobrescrita direcionada por id substitui a linha inteira — redeclare cada chave que precisar. O `cordis.patch.yml` documenta cada chave em linha.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Interruptor mestre; `true` mais ao menos um backend é a adesão explícita |
| `otlp` | `null` | Configuração do backend OTLP, ou `null` para desativá-lo |
| `otlp.endpoint` | *(obrigatório)* | URL base do OTLP; `/v1/traces` e `/v1/metrics` são acrescentados |
| `otlp.serviceName` | `deepseek-harness` | Atributo de recurso `service.name` |
| `otlp.serviceVersion` | *(nenhum)* | Atributo de recurso `service.version` |
| `otlp.headers` | `{}` | Cabeçalhos extras mesclados em cada requisição de exportação |
| `otlp.timeoutMs` | `10000` | Tempo limite por requisição |
| `langfuse` | `null` | Configuração do backend Langfuse, ou `null` para desativá-lo |
| `langfuse.baseUrl` | `https://cloud.langfuse.com` | URL base do Langfuse |
| `langfuse.publicKey` | *(obrigatório)* | Chave pública do projeto |
| `langfuse.secretKey` | *(obrigatório)* | Chave secreta do projeto |
| `langfuse.release` | *(nenhum)* | Tag de release carimbada nos traces |
| `langfuse.timeoutMs` | `10000` | Tempo limite por requisição |
| `capture.turns` | `true` | Spans de ciclo de vida do turno |
| `capture.steps` | `true` | Spans de ciclo de vida do passo |
| `capture.tools` | `true` | Spans de chamada de ferramenta com argumentos/resultados saneados |
| `capture.llm` | `true` | Spans de geração de LLM |
| `llm.prompt` | `true` | Captura o prompt de requisição saneado (`false` = apenas tamanhos) |
| `llm.completion` | `true` | Captura a completion saneada (`false` = apenas tamanhos) |
| `metadata.sessionId` | `true` | Atributo de id de sessão |
| `metadata.cwd` | `false` | Diretório de trabalho da sessão (um caminho local — desligado por padrão) |
| `metadata.agentPreset` | `true` | Atributo de id do agent preset |
| `metadata.model` | `true` | Atributos de provider/modelo |
| `metrics.tokens` | `true` | Contadores de tokens por provider/modelo |
| `metrics.cost` | `true` | Contadores de custo em USD (precisam de regras `pricing` que coincidam) |
| `metrics.contextTokens` | `true` | Gauge de pressão de contexto (precisa de `ctx.tokenMeter`) |
| `pricing` | `[]` | Tabela de preços, primeira coincidência vence: `{ provider?, model, inputPerToken, outputPerToken, cacheReadPerToken?, cacheWritePerToken? }` |
| `sanitize.enabled` | `true` | Interruptor mestre de redação (`false` desativa a redação, nunca o truncamento) |
| `sanitize.redactKeys` | `[]` | Substrings de nome de chave extras (key/token/secret/password/authorization/credential/apiKey sempre incluídas) |
| `sanitize.redactPatterns` | `[]` | Expressões regulares de segredos extras |
| `sanitize.truncatePromptChars` | `4000` | Orçamento de caracteres do prompt |
| `sanitize.truncateCompletionChars` | `4000` | Orçamento de caracteres da completion |
| `sanitize.truncateToolInputChars` | `2000` | Orçamento de caracteres dos argumentos de ferramenta |
| `sanitize.truncateToolOutputChars` | `2000` | Orçamento de caracteres do resultado de ferramenta |
| `sanitize.truncateAttributeChars` | `512` | Orçamento de strings de atributos de span |
| `batch.maxRecords` | `256` | Flush quando a fila atinge este número de registros |
| `batch.flushIntervalMs` | `5000` | Intervalo de flush por temporizador |
| `batch.maxQueueRecords` | `2000` | Limite da fila em memória; o excesso derrama para o buffer |
| `batch.maxBufferRecords` | `10000` | Limite do buffer offline durável; os registros mais antigos caem primeiro |
| `batch.bufferRetryIntervalMs` | `30000` | Intervalo de tentativa do buffer offline |
| `retry.maxAttempts` | `5` | Tentativas por lote, incluindo a primeira |
| `retry.baseDelayMs` | `1000` | Primeiro atraso de backoff |
| `retry.factor` | `2` | Multiplicador de backoff por falha consecutiva |
| `retry.maxDelayMs` | `60000` | Teto do backoff |
| `remote.enabled` | `false` | Monta o Typert remote `observe` (interruptor) |

## Tools & surfaces

Este plugin **não registra ferramentas de modelo** — é um exportador em segundo plano. Suas superfícies:

- **Consome** `session/event` (coleta de spans/métricas), `session/flush` (impulso de exportação best-effort — o checkpoint de durabilidade nunca espera um backend remoto) e `session/disposed`.
- **Serviço remote opcional** `observe` — `observe/status` devolve o estado do interruptor, os backends configurados, a profundidade da fila e a ocupação do buffer; `observe/setEnabled` para e retoma a exportação em tempo de execução.

## Permissions & data

- **Permissões**: `network:outbound` para os endpoints que você configurar, `session:read` para o fluxo de eventos, `storage:write` para o buffer offline; sem código nativo, sem acesso ao sistema de arquivos.
- **Dados**: tudo o que é enviado deriva do registro de sessão e é saneado (redação + truncamento) antes de enfileirar, armazenar ou transmitir. O buffer offline guarda apenas registros saneados, re-validados ao serem lidos.
- **Credenciais**: as chaves pública/secreta do Langfuse viajam apenas para o endpoint Langfuse configurado; os cabeçalhos OTLP apenas para o endpoint OTLP configurado. O plugin não armazena credenciais — guarde-as em referências de credenciais ou valores injetados pelo ambiente.

## Security boundaries

- **Desligado por padrão** — nada é capturado ou exportado sem adesão explícita.
- **Sanear antes de enviar** — redação estrutural de chaves, padrões de segredos embutidos (chaves de API, tokens do GitHub, chaves da AWS, credenciais bearer, chaves privadas), seus padrões e orçamentos de caracteres aplicam-se antes de qualquer registro sair da memória.
- **Re-validação no limite durável** — registros lidos do armazenamento são checados novamente antes que um sink possa vê-los.
- **Falha ruidosa, falha contida** — falhas de exportação avisam, contam, tentam de novo e por fim vão para o spool; um manipulador de sessão que falha é capturado e registrado, de modo que a observabilidade nunca pode quebrar o caminho quente do harness.
- **Model-visible ⟺ logged** — as exportações de prompt/completion projetam apenas o cabeçalho registrado e a superfície da sessão; o exportador não inventa conteúdo.

## Known limitations

- **Somente rc.8** — o plugin é desenvolvido e testado contra `@deepseek-ai/dsh@0.1.0-rc.8`; baselines mais novos devem funcionar e são verificados pelo workflow compat mensal.
- **Métricas evitam o caminho de tentativa/spool** — as métricas OTLP são agregadas cumulativamente, então um flush perdido se autocura no seguinte (por design, não é um bug).
- **Sem amostragem** — toda família de spans habilitada é exportada; ajuste os interruptores `capture.*` e `batch.maxBufferRecords` para sessões de alto volume.

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc: src + tests contra o checkout local do harness
pnpm run typecheck:ci  # tsc contra os tipos publicados 0.1.0-rc.8 (sem paths)
pnpm test           # vitest: 95 testes, 13 suítes (Context/Session/storage seam reais)
pnpm run test:coverage  # porta de cobertura (90/80/90/90)
pnpm run build      # bundle tsdown + declarações tsc (lib/)
pnpm run verify:self-contained  # as especificações de dependências resolvem pelo registry
pnpm run verify:artifacts       # face ESM construída + bundle patch presentes
node scripts/check-readme-sync.mjs  # porta de sincronia dos cinco READMEs
pnpm pack           # o tarball publicado
```

## Topics

`dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing`

## Contributors

- [@PerryLink](https://github.com/PerryLink) — criador e mantenedor: collector, pipelines, spool, sinks OTLP/Langfuse, saneamento e a documentação em cinco idiomas.

## PerryLink DSH Plugin Family

Este projeto é um dos [29 complementos do DeepSeek Harness](https://github.com/PerryLink) mantidos por [PerryLink](https://github.com/PerryLink). Se este ajuda você, os outros provavelmente também ajudarão:

| Plugin | One-liner |
|---|---|
| [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) | Auto-revisão com segundo modelo na cadeia de aprovação, falha fechada por padrão |
| [dsh-background-agents](https://github.com/PerryLink/dsh-background-agents) | Agentes filhos em segundo plano e duráveis com barra lateral Web, mensagens e interrupção |
| [dsh-budget](https://github.com/PerryLink/dsh-budget) | Governança de custos para DeepSeek Harness: orçamentos, carbono e latência em um painel. |
| [dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind) | Equivalente ao /rewind do Claude Code: instantâneos, bifurcações e restauração de uma vez |
| [dsh-claude-move](https://github.com/PerryLink/dsh-claude-move) | Migra sessões, memória, skills e CLAUDE.md do Claude Code para o DSH |
| [dsh-click](https://github.com/PerryLink/dsh-click) | Controle de desktop nativo multiplataforma para DeepSeek Harness — Windows primeiro. |
| [dsh-composer-history](https://github.com/PerryLink/dsh-composer-history) | Histórico de entrada estilo terminal para o compositor web: setas, busca Ctrl+R |
| [dsh-defend](https://github.com/PerryLink/dsh-defend) | Defesa contra injeção de prompt, jailbreak e vazamento de segredos para DeepSeek Harness. |
| [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | Guarda de disciplina de engenharia: sabatina de requisitos, portões de teste, revisão adversária |
| [dsh-draw](https://github.com/PerryLink/dsh-draw) | Roteamento unificado de geração de imagens estáticas para DeepSeek Harness. |
| [dsh-fast](https://github.com/PerryLink/dsh-fast) | Diagnóstico de desempenho somente leitura para DeepSeek Harness. |
| [dsh-github](https://github.com/PerryLink/dsh-github) | Integração de PR/issues do GitHub para DSH, toda escrita com aprovação |
| [dsh-library](https://github.com/PerryLink/dsh-library) | Base de conhecimento documental local para DeepSeek Harness. |
| [dsh-local-ai](https://github.com/PerryLink/dsh-local-ai) | Integração de modelos locais (Ollama) para DeepSeek Harness. |
| [dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions) | Diagnóstico, formatação, completação, ações e renomeação LSP via servidores de linguagem |
| [dsh-mask](https://github.com/PerryLink/dsh-mask) | Middleware de mascaramento de PII para DeepSeek Harness — anonimiza antes do modelo e restaura na camada de exibição. |
| [dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel) | Painel MCP somente leitura: comando /mcp + aba de configurações com status, ferramentas e erros |
| [dsh-memento](https://github.com/PerryLink/dsh-memento) | Memória entre sessões com porta de aprovação: seam ctx.memory + SQLite + ferramenta memory |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | Exportador de observabilidade OpenTelemetry e Langfuse para DeepSeek Harness. |
| [dsh-output-styles](https://github.com/PerryLink/dsh-output-styles) | Troca de estilos em tempo de execução equivalente ao outputStyles do Claude Code |
| [dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules) | Regras declarativas allow/deny/ask estilo Claude Code com auditoria |
| [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | Base de conhecimento de desenvolvimento de plugins como skill de agente sob demanda |
| [dsh-score](https://github.com/PerryLink/dsh-score) | Pontuação de qualidade multidimensional para plugins do DeepSeek Harness. |
| [dsh-session-pin](https://github.com/PerryLink/dsh-session-pin) | Fixa sessões na barra lateral Web com ordenação durável |
| [dsh-session-sync](https://github.com/PerryLink/dsh-session-sync) | Sincronização de sessões entre dispositivos para DeepSeek Harness — um espelho git dedicado do seu armazenamento de sessões. |
| [dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security) | Pacote de skills de auditoria de segurança: varredura de segredos, revisão de dependências e cadeia de suprimentos |
| [dsh-talk](https://github.com/PerryLink/dsh-talk) | Loop de sessão com voz para DeepSeek Harness: fale e ouça a resposta. |
| [dsh-test-drive](https://github.com/PerryLink/dsh-test-drive) | Testes isolados de instalação e inicialização para plugins do DeepSeek Harness. |
| [dsh-translate](https://github.com/PerryLink/dsh-translate) | Tradução de parâmetros entre fornecedores e reparo determinístico de JSON para DeepSeek Harness. |

## License

[Apache License 2.0](LICENSE) © 2026 dsh-observe contributors
