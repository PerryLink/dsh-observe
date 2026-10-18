<div align="center">

# 📊 dsh-observe
- **1024 商店渠道**：先 `npm i -g dsh1024`，再 `dsh1024 plugin --profile web add dsh-observe`（计入 [deepseek1024.com](https://deepseek1024.com) 安装排行）。

**DeepSeek Harness 的 OpenTelemetry 与 Langfuse 可观测性导出器。**

*把会话事件变成 OTLP 追踪与 Langfuse 观测 —— 脱敏、缓冲、默认关闭。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-observe)
[![DSH plugin](https://img.shields.io/badge/dsh--plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![dsh-doctor](https://raw.githubusercontent.com/PerryLink/dsh-plugin-doctor/main/badges/PerryLink__dsh-observe.svg)](https://github.com/PerryLink/dsh-plugin-doctor#verified-徽章)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-brightgreen.svg)](#)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-observe/ci.yml?branch=main&label=CI)](https://github.com/PerryLink/dsh-observe/actions)
[![Version](https://img.shields.io/github/v/tag/PerryLink/dsh-observe?label=version)](https://github.com/PerryLink/dsh-observe/releases)
[![npm version](https://img.shields.io/npm/v/dsh-observe)](https://www.npmjs.com/package/dsh-observe)
[![npm downloads](https://img.shields.io/npm/dm/dsh-observe)](https://www.npmjs.com/package/dsh-observe)
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-observe?metric=downloads&lang=zh)](https://dshfind.com/zh/plugins/PerryLink/dsh-observe?ref=badge)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```sh
dsh plugin --profile <name> add dsh-observe
```


</div>

---


**📖 生态实测知识库**（实测数据，不是营销）：[插件开发指南 · 选型实测数据 · 维护取舍判据](https://perrylink.github.io/dsh-plugin-guide/)。

<!-- star-cta -->
## Install & uninstall

- **git 通道**（最新 `main`）：`dsh plugin --profile web add github:PerryLink/dsh-observe` —— `prepare` 脚本仅用生产依赖构建。
- **npm 通道**（正式发布版）：`dsh plugin --profile web add dsh-observe`。
- **tarball 通道**：在本仓库执行 `pnpm pack`，然后 `dsh plugin --profile web add ./dsh-observe-<version>.tgz`。
- **卸载**：`dsh plugin --profile web remove dsh-observe`（或从 profile patch 中删除该行）。

> 如果 pnpm 对本包报 `ERR_PNPM_IGNORED_BUILDS`（esbuild 的平台二进制无害校验），在你的 `pnpm-workspace.yaml` 中加入 `allowBuilds: { esbuild: true }` —— `dsh` CLI 会打印确切片段。

## ⭐ 如果它帮到了你

这个插件是 [DSH 插件家族](https://github.com/PerryLink)的一员（95 个，全部 Apache-2.0）。如果你在用，**给个 star** —— 它不会解锁任何功能，但会让下一个人在搜索里更容易找到它。

*English:* part of a 95 plugin family for DeepSeek Harness. If it is useful, **a star helps the next person find it** — nothing is gated behind it.

## What is dsh-observe?

DeepSeek Harness 的 OpenTelemetry 与 Langfuse 可观测性导出器。

把会话事件变成 OTLP 追踪与 Langfuse 观测 —— 脱敏、缓冲、默认关闭。

![dsh-observe 终端演示：dsh-observe — opt in, point OTLP at your collector](https://raw.githubusercontent.com/PerryLink/dsh-observe/main/docs/assets/dsh-observe-hero.png)

![Animated terminal demo of dsh-observe](https://raw.githubusercontent.com/PerryLink/dsh-observe/main/docs/assets/dsh-observe-demo.gif)

*同一次运行，动图版。*

## Compatibility

| 方面 | 状态 |
|---|---|
| Harness | DeepSeek Harness `dsh-v0.2.1-alpha.1`（2026-09-22 已适配）：会话格式 V4 把工具结果改为 `role: 'tool'` 的一等消息，顶层携带 `toolCallId` + `content` + 可选 `isError` —— V3 的 `tool-result` 内容块已从宿主 `ContentBlockMap` 移除，本插件只读 V4 形状（升级前的 V3 日志仍可经只读兼容路径投影）。会话格式 V3 的其余特征沿用：助手流内嵌到 `assistant/message` / `assistant/attempt`，系统提示词为 surface 节点 0（`system/message`）；本插件只消费实时事件流，从不读取会话日志文件。peer 复合范围 `>=0.1.2-rc.1 <0.2.0 \|\| >=0.1.5-alpha.1 <0.2.0 \|\| >=0.1.6-0 <0.2.0 \|\| >=0.1.7-0 <0.2.0` 保持每条已发布线可安装（本地完整门禁链；profile 安装冒烟由 compat 工作流覆盖）。 |
| Node | `^22.19.0 \|\| >=24.0.0` |
| 后端 | OpenTelemetry OTLP/HTTP（traces + metrics，JSON 编码）与 Langfuse（LLM 可观测）——二选一或同时 |
| 模型 | 与模型无关：它导出 session/event 流，自身不调用任何模型 |

## What you get

`dsh-observe` 把 harness 的 `session/event` 流变成标准可观测协议：

- **Spans** —— turn、step、工具调用（耗时/状态/重试推导）与 LLM 生成 span，按 turn 连成 trace，id 确定性可重放。
- **Metrics** —— 按 provider/model 的 token 计数、USD 成本计数（可配价格表）、以及可选的 `ctx.tokenMeter` 上下文压力 gauge。
- **脱敏采集** —— prompt 与 completion 正文先经结构性键名脱敏 + 内置密钥模式 + 自定义模式 + 字符预算截断，之后才进入队列或发送。
- **可靠性** —— 异步批量（数量/定时触发）、有界持久离线缓冲（storage-domain，最旧优先淘汰）、确定性指数退避重试；未送达批次重启后仍在。
- **运行时总开关** —— 可选 Typert remote（`observe/status`、`observe/setEnabled`）让设置页在不卸载的情况下停止/恢复导出。
- **默认关闭** —— `enabled: true` 且至少配置一个后端才是显式开启；否则不采集、不导出。

```text
session/event 流
   │ collector（turn/step/tool/llm span、metrics）
   │ sanitize（键名、密钥、预算）
   ├──▶ pipeline "otlp"  ── 队列 ── flush ──▶ OTLP /v1/traces + /v1/metrics
   │         └─ 重试/退避 ──┐
   ├──▶ pipeline "langfuse" ── 队列 ── flush ──▶ Langfuse ingestion
   │         └─ 重试/退避 ──┤
   └────────── 持久 spool（离线缓冲，有界）◀┘
```

## Quick start

```sh
dsh plugin --profile web add github:PerryLink/dsh-observe
```

```sh
# 1. 把 bundle 装进你的 profile
dsh plugin --profile web add github:PerryLink/dsh-observe

# 或从 npm 安装（正式发布版）
dsh plugin --profile web add dsh-observe

# 2. 在 profile patch（cordis.yml）里配置后端并重启
dsh --profile web
```

最小 OTLP 配置（`cordis.patch.yml` 里该行默认注释掉）：

```yaml
- insert:
    - id: dsh-observe
      name: dsh-observe
      config:
        enabled: true
        otlp:
          endpoint: http://localhost:4318
```

然后核实行挂载：

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-observe'
```

## Configuration

所有可调项都是 Schemastery `Config` 字段（可在 cordis.yml 中修改）。按 id 定向覆盖会替换整行 —— 需要重新声明每个键。`cordis.patch.yml` 内联说明了每个键。

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | 总开关；`true` 且至少一个后端才是显式开启 |
| `otlp` | `null` | OTLP 后端配置，`null` 表示禁用 |
| `otlp.endpoint` | *(必填)* | OTLP 基础 URL；`/v1/traces` 与 `/v1/metrics` 由插件追加 |
| `otlp.serviceName` | `deepseek-harness` | `service.name` 资源属性 |
| `otlp.serviceVersion` | *(无)* | `service.version` 资源属性 |
| `otlp.headers` | `{}` | 合并进每个导出请求的额外请求头 |
| `otlp.timeoutMs` | `10000` | 单请求超时 |
| `langfuse` | `null` | Langfuse 后端配置，`null` 表示禁用 |
| `langfuse.baseUrl` | `https://cloud.langfuse.com` | Langfuse 基础 URL |
| `langfuse.publicKey` | *(必填)* | 项目公钥 |
| `langfuse.secretKey` | *(必填)* | 项目密钥 |
| `langfuse.release` | *(无)* | 打在各 trace 上的 release 标签 |
| `langfuse.traceName` | `session {session} turn {turn}` | trace 名称模板；`{session}`/`{turn}` 按 trace 插值 |
| `langfuse.tags` | `[]` | 打在每个 trace 上的静态标签 |
| `langfuse.timeoutMs` | `10000` | 单请求超时 |
| `capture.turns` | `true` | turn 生命周期 span |
| `capture.steps` | `true` | step 生命周期 span |
| `capture.tools` | `true` | 工具调用 span（参数/结果脱敏） |
| `capture.llm` | `true` | LLM 生成 span |
| `llm.prompt` | `true` | 采集脱敏后的请求 prompt（`false` 只记大小） |
| `llm.completion` | `true` | 采集脱敏后的 completion（`false` 只记大小） |
| `metadata.sessionId` | `true` | 会话 id 属性 |
| `metadata.cwd` | `false` | 会话工作目录（本地路径——默认关闭） |
| `metadata.agentPreset` | `true` | agent preset id 属性 |
| `metadata.model` | `true` | provider/model 属性 |
| `metrics.tokens` | `true` | 按 provider/model 的 token 计数 |
| `metrics.cost` | `true` | USD 成本计数（需 `pricing` 规则匹配） |
| `metrics.contextTokens` | `true` | 上下文压力 gauge（需 `ctx.tokenMeter`） |
| `pricing` | `[]` | 价格表，首个匹配生效：`{ provider?, model, inputPerToken, outputPerToken, cacheReadPerToken?, cacheWritePerToken? }` |
| `sanitize.enabled` | `true` | 脱敏总开关（`false` 只关脱敏，不关截断） |
| `sanitize.redactKeys` | `[]` | 额外键名子串（key/token/secret/password/authorization/credential/apiKey 恒生效） |
| `sanitize.redactPatterns` | `[]` | 额外密钥正则 |
| `sanitize.truncatePromptChars` | `4000` | prompt 字符预算 |
| `sanitize.truncateCompletionChars` | `4000` | completion 字符预算 |
| `sanitize.truncateToolInputChars` | `2000` | 工具参数字符预算 |
| `sanitize.truncateToolOutputChars` | `2000` | 工具结果字符预算 |
| `sanitize.truncateAttributeChars` | `512` | span 属性字符串预算 |
| `batch.maxRecords` | `256` | 队列达到该数量即 flush |
| `batch.flushIntervalMs` | `5000` | 定时 flush 间隔 |
| `batch.maxQueueRecords` | `2000` | 内存队列上限；超出溢入缓冲 |
| `batch.maxBufferRecords` | `10000` | 持久离线缓冲上限；最旧记录先丢 |
| `batch.bufferRetryIntervalMs` | `30000` | 离线缓冲重试间隔 |
| `retry.maxAttempts` | `5` | 每批尝试次数（含首次） |
| `retry.baseDelayMs` | `1000` | 首次退避延迟 |
| `retry.factor` | `2` | 每连续失败一次的退避倍数 |
| `retry.maxDelayMs` | `60000` | 退避上限 |
| `remote.enabled` | `false` | 挂载 `observe` Typert remote（总开关） |

## Tools & surfaces

本插件**不注册任何模型工具** —— 它是后台导出器。其界面：

- **消费** `session/event`（span/metric 采集）、`session/flush`（尽力导出 kick —— 持久化检查点绝不等待远端后端）、`session/disposed`。
- **可选 remote 服务** `observe` —— `observe/status` 返回总开关状态、已配置后端、队列深度与缓冲占用；`observe/setEnabled` 在运行时停止/恢复导出。

## Permissions & data

- **权限**：对你配置的端点出网（`network:outbound`）、读取事件流（`session:read`）、写离线缓冲（`storage:write`）；无原生代码、无文件系统访问。
- **数据**：所有外发内容都来自会话日志，并在入队、缓冲、发送前完成脱敏（脱敏 + 截断）。离线缓冲只存脱敏记录，读回时再次校验。
- **凭据**：Langfuse 公钥/密钥只发往你配置的 Langfuse 端点；OTLP 请求头只发往你配置的 OTLP 端点。插件自身不存任何凭据 —— 请使用凭据引用或环境注入。

## Security boundaries

- **默认关闭** —— 不显式开启则不采集、不导出。
- **发送前脱敏** —— 结构性键名脱敏、内置密钥模式（API key、GitHub token、AWS key、bearer 凭据、私钥）、自定义模式与字符预算，全部在任何记录离开内存前生效。
- **持久边界再校验** —— 从存储读回的记录在到达 sink 前再次检查。
- **失败大声、失败隔离** —— 导出失败会告警、计数、重试并最终入缓冲；会话事件处理失败被捕获并记录，可观测性永远不会拖垮 harness 热路径。
- **模型可见 ⟺ 已记录** —— prompt/completion 导出只投影会话 surface（其节点 0 即系统提示词）与已记录的 header（调用配置与工具）；导出器不发明任何内容。

## Known limitations

- **npm 0.1.7-rc.2** —— 插件针对 `@deepseek-ai/dsh@0.1.7-rc.2` 开发与测试（devDeps 与 CI 主尺子）；peer 复合范围 `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-0 <0.2.0 || >=0.1.7-0 <0.2.0` 保持每条已发布线可安装，旧基线与第二把尺子（`typecheck:ci`）及 compat 工作流共同覆盖。
- **审计事件不落盘** —— 本插件自身的 `observe/*` 记录仅作审计：当前宿主线的会话 append 闸门只接纳 surface 事件，因此不会有 `observe/*` 事件写入会话日志；插件也不会用未标记 append 伪造一条（那会让会话不可读）。审计面请以 `/observe` 状态输出与 OTLP/Langfuse 后端为准。
- **Metrics 不走重试/缓冲路径** —— OTLP metrics 按累计聚合，丢失一次 flush 会在下一次自愈（设计如此，非缺陷）。
- **无采样** —— 每个启用的 span 族都会导出；大流量会话请调整 `capture.*` 开关与 `batch.maxBufferRecords`。

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc：src + tests，对照 0.1.7-rc.2 devDeps（无 tsconfig paths）
pnpm run typecheck:ci  # tsc：对照已发布线（无 paths）
pnpm run check:ruler-live  # canary：必须编译失败，以证明尺子仍是活的
pnpm test           # vitest：126 个测试、18 个套件（真实 Context/Session/storage 接缝）
pnpm run test:coverage  # 覆盖率门禁（90/80/90/90）
pnpm run build      # tsdown bundle + tsc 声明（lib/）
pnpm run verify:self-contained  # 依赖声明全部来自 registry
pnpm run verify:artifacts       # 构建产物 ESM 面 + bundle patch 齐全
node scripts/check-readme-sync.mjs  # 五语 README 同步门
pnpm pack           # 发布用 tarball
```

## Topics

`dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing`

## Contributors

- [@PerryLink](https://github.com/PerryLink) —— 创建者与维护者：collector、pipeline、spool、OTLP/Langfuse sink、脱敏层与五语文档。

## PerryLink DSH Plugin Family

本项目是 [PerryLink](https://github.com/PerryLink) 维护的 DeepSeek Harness 插件家族成员：**87 个活跃维护**，名册共 **95** 个，其中 **5 个已冻结**、**3 个已退役**。完整名单默认折叠，避免每个 README 的首屏被长表淹没；点击展开可查看每一行，原因见「状态」列。

<details>
<summary>展开全部 95 个插件</summary>

| 插件 | 一句话 | 状态 |
|---|---|---|
| **[dsh-aqua-input-check](https://github.com/PerryLink/dsh-aqua-input-check)** | 水产养殖投入品记录核对（按投入品用量、休药期与起捕间隔核对记录自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-archive-check](https://github.com/PerryLink/dsh-archive-check)** | 档案归档完整性与保管期限核对（依据《档案法》及配套规定，仅提示差异，不作出定性结论） |  |
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default |  |
| **[dsh-autotier](https://github.com/PerryLink/dsh-autotier)** | Automatic strong/cheap model-tier routing with deterministic risk guards and a `/tier` command |  |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | 🚫 已退役 — 见仓库 README |
| **[dsh-bid-ca-precheck](https://github.com/PerryLink/dsh-bid-ca-precheck)** | 投标文件符合性预检（按招标文件逐条核对响应情况，仅提示差异，不作出定性结论） |  |
| **[dsh-bid-qual-check](https://github.com/PerryLink/dsh-bid-qual-check)** | 投标人资格条件核对（按资格条件与证明材料核对逐条响应，仅提示差异，不作出定性结论） |  |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | 🧊 已冻结 — 见仓库 README |
| **[dsh-cert-mcp](https://github.com/PerryLink/dsh-cert-mcp)** | Read-only MCP server exposing the certification registry: grades, snapshots and five-dimension evidence |  |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind-equivalent: snapshots, session forks, one-shot restore |  |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | Migrate Claude Code sessions, memory, skills and CLAUDE.md into DSH | 🧊 已冻结 — 见仓库 README |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | Cross-platform native desktop control for DeepSeek Harness — Windows first. |  |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | Terminal-style input history for the web composer: arrows, Ctrl+R search |  |
| **[dsh-contract-stance](https://github.com/PerryLink/dsh-contract-stance)** | 合同条款立场台账核对（按立场、风险等级与退让底线核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-customs-doc-check](https://github.com/PerryLink/dsh-customs-doc-check)** | 报关单证一致性核对（按公开的报关单填制规范核对单证间字段一致性，仅提示差异，不作出定性结论） |  |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | Dataset quality checks and citation cross-checks (the optional numeric bridge consumed here) |  |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | Prompt-injection, jailbreak, and secret-leak defense for DeepSeek Harness. | 🧊 已冻结 — 见仓库 README |
| **[dsh-demurrage-ledger](https://github.com/PerryLink/dsh-demurrage-ledger)** | 滞箱费台账核对（按免箱期与费率核对超期天数与金额的自洽性，仅提示差异，不作出定性结论） |  |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | Engineering-discipline guard: requirements grill, test gates, adversary review |  |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | Unified static-image generation routing for DeepSeek Harness. | 🧊 已冻结 — 见仓库 README |
| **[dsh-drill-script-check](https://github.com/PerryLink/dsh-drill-script-check)** | 应急演练脚本核对（按阶段、响应分级、指挥与资源要素核对脚本齐备，仅提示差异，不作出定性结论） |  |
| **[dsh-eia-guide-check](https://github.com/PerryLink/dsh-eia-guide-check)** | 环评导则适用性核对（按要素、导则名称与执行标准核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-emergency-plan](https://github.com/PerryLink/dsh-emergency-plan)** | 应急预案要素齐备性与条款级页码定位（依据 GB/T 29639-2020 等公开文件，仅提示差异，不作出定性结论） |  |
| **[dsh-essay-rubric-check](https://github.com/PerryLink/dsh-essay-rubric-check)** | 作文量表评分核对（按评分项、原文定位与分值算术核对评分自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-evidence-check](https://github.com/PerryLink/dsh-evidence-check)** | 证据清单齐备性核对（按待证事实与证据要素核对清单自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-export-ctl-check](https://github.com/PerryLink/dsh-export-ctl-check)** | 出口管制物项核对（按管制清单、最终用途与许可证核对台账齐备，仅提示差异，不作出定性结论） |  |
| **[dsh-fast](https://github.com/PerryLink/dsh-fast)** | Read-only performance diagnostics for DeepSeek Harness. |  |
| **[dsh-fmea-table-check](https://github.com/PerryLink/dsh-fmea-table-check)** | FMEA 分析表要素齐备性与风险顺序数一致性核对（按公开的 FMEA 方法标准核对表内自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-forecast-penalty](https://github.com/PerryLink/dsh-forecast-penalty)** | 预测准确率考核核对（按准确率、门槛与考核单价核对考核费用的算术自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-fund-research](https://github.com/PerryLink/dsh-fund-research)** | Deterministic research reports for Chinese public mutual funds |  |
| **[dsh-github](https://github.com/PerryLink/dsh-github)** | GitHub PR/issues integration for DSH, every write gated by approval |  |
| **[dsh-gongwen-flow-check](https://github.com/PerryLink/dsh-gongwen-flow-check)** | 公文流转与办理时限核对（按公开的公文处理规范核对环节完整性与时限，仅提示差异，不作出定性结论） |  |
| **[dsh-gongwen-word-check](https://github.com/PerryLink/dsh-gongwen-word-check)** | 公文格式要素核对（按公开的党政机关公文格式标准核对版头与主体要素，仅提示差异，不作出定性结论） |  |
| **[dsh-guard-plan-qc](https://github.com/PerryLink/dsh-guard-plan-qc)** | 劳动保护与安全防护用品配置表核对（按公开的配备标准核对品名规格与配置数量，仅提示差异，不作出定性结论） |  |
| **[dsh-hazchem-check](https://github.com/PerryLink/dsh-hazchem-check)** | 危险化学品临界量与重大危险源辨识核对（按储存量与临界量核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-hazplan-check](https://github.com/PerryLink/dsh-hazplan-check)** | HAZOP 分析表要素齐备性与偏差推导一致性核对（依据公开的危险与可操作性分析标准，仅提示差异，不作出定性结论） |  |
| **[dsh-hidden-risk-map](https://github.com/PerryLink/dsh-hidden-risk-map)** | 安全隐患台账→《工贸企业重大事故隐患判定标准》（应急管理部令第10号）条款映射提示（仅提示差异，不作出定性结论） |  |
| **[dsh-hs-classify](https://github.com/PerryLink/dsh-hs-classify)** | 商品归类层级一致性核对（按章、品目、子目与商品编号的层级关系核对自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-icd-rule-check](https://github.com/PerryLink/dsh-icd-rule-check)** | ICD 合并编码与星剑号配对提示（依据 GB/T 14396-2016 与公开的 ICD 使用说明，仅提示差异，不作出定性结论） |  |
| **[dsh-industry-research](https://github.com/PerryLink/dsh-industry-research)** | Industry research orchestration that seals its deliverables through this plugin's `ctx.researchReport.assemble` |  |
| **[dsh-lawcite-adapter](https://github.com/PerryLink/dsh-lawcite-adapter)** | 法条引用与文书要素核对（按名称、条号、原文与效力状态核对引用可核验性，仅提示差异，不作出定性结论） |  |
| **[dsh-laya](https://github.com/PerryLink/dsh-laya)** | Laya typed decisions (`noul`/`choice`/`score`) as a first-class Cordis service and model-visible tools |  |
| **[dsh-lc-doc-check](https://github.com/PerryLink/dsh-lc-doc-check)** | 信用证单据条款核对（按单据种类、份数、期限与不符点核对交单自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-learning-gap-check](https://github.com/PerryLink/dsh-learning-gap-check)** | 能力差距与培养计划核对（按能力等级差、培养措施与完成期限核对台账闭环，仅提示差异，不作出定性结论） |  |
| **[dsh-library](https://github.com/PerryLink/dsh-library)** | Local document knowledge base for DeepSeek Harness. |  |
| **[dsh-local-ai](https://github.com/PerryLink/dsh-local-ai)** | Local-model (Ollama) integration for DeepSeek Harness. |  |
| **[dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions)** | LSP diagnostics, formatting, completion, code actions and rename over language servers |  |
| **[dsh-mask](https://github.com/PerryLink/dsh-mask)** | PII masking middleware: anonymize at the model boundary, restore at the display layer |  |
| **[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)** | Read-only MCP runtime panel: /mcp command + Settings tab with status, tools and errors |  |
| **[dsh-medrec-qc](https://github.com/PerryLink/dsh-medrec-qc)** | 病案首页形式质控与逻辑矛盾提示（依据国卫办医发〔2016〕24号等公开文件，仅提示差异，不作出定性结论） |  |
| **[dsh-memento](https://github.com/PerryLink/dsh-memento)** | Approval-gated cross-session memory: ctx.memory seam + SQLite + memory tool |  |
| **[dsh-nsfc-form-check](https://github.com/PerryLink/dsh-nsfc-form-check)** | 国家自然科学基金申请书形式审查与匿名化提示（依据《国家自然科学基金条例》与申请人导入的当年指南，仅提示差异，不作出定性结论） |  |
| **[dsh-nurse-record-check](https://github.com/PerryLink/dsh-nurse-record-check)** | 护理记录时限、签名与评估表完整性校验（依据《病历书写基本规范》等公开文件，仅提示差异，不作出定性结论） |  |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | OpenTelemetry and Langfuse observability exporter for DeepSeek Harness. |  |
| **[dsh-origin-rvc-check](https://github.com/PerryLink/dsh-origin-rvc-check)** | 原产地区域价值成分核对（按 RVC 定义式与门槛核对原产地判定自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-ota-review-check](https://github.com/PerryLink/dsh-ota-review-check)** | 在线点评回复台账核对（按回复时限、问题分类与整改状态核对台账闭环，仅提示差异，不作出定性结论） |  |
| **[dsh-output-styles](https://github.com/PerryLink/dsh-output-styles)** | Claude Code outputStyles-equivalent runtime style switching |  |
| **[dsh-paper-doc-adapter](https://github.com/PerryLink/dsh-paper-doc-adapter)** | 试卷解析结构核对（按题型、答案、分值与 yotta 标识核对试卷结构自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules)** | Claude Code-style declarative allow/deny/ask permission rules with audit |  |
| **[dsh-permit-report-check](https://github.com/PerryLink/dsh-permit-report-check)** | 行政许可办理核对（按申请材料、法定时限与决定记录核对台账闭环，仅提示差异，不作出定性结论） |  |
| **[dsh-pipeline-check](https://github.com/PerryLink/dsh-pipeline-check)** | 项目全流程文件链条核对（按环节先后与金额口径核对链条自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-pleading-draft](https://github.com/PerryLink/dsh-pleading-draft)** | 起诉状要素齐备性核对（按诉请、事实、证据、法条四要素核对文书齐备，仅提示差异，不作出定性结论） |  |
| **[dsh-plugin-doctor](https://github.com/PerryLink/dsh-plugin-doctor)** | Zero-dependency static + sandbox smoke detector for DSH plugins |  |
| **[dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide)** | Plugin-development knowledge base as an on-demand agent skill |  |
| **[dsh-plugin-kit](https://github.com/PerryLink/dsh-plugin-kit)** | Shared zero-runtime-dependency toolkit for the PerryLink DSH plugins |  |
| **[dsh-plugin-upgrade](https://github.com/PerryLink/dsh-plugin-upgrade)** | One-package, one-corridor-index plugin upgrade skill: routes a repository to the matching closed corridor card |  |
| **[dsh-policy-brief-draft](https://github.com/PerryLink/dsh-policy-brief-draft)** | 政策专报要素核对（按观点、依据、出处与建议核对专报齐备，仅提示差异，不作出定性结论） |  |
| **[dsh-power-loss-split](https://github.com/PerryLink/dsh-power-loss-split)** | 线损电量拆分与考核表核对（依据公开的线损计算口径，仅提示差异，不作出定性结论） |  |
| **[dsh-power-ticket-check](https://github.com/PerryLink/dsh-power-ticket-check)** | 电力工作票要素齐备性与签发许可顺序核对（依据现行电力安全工作规程，仅提示差异，不作出定性结论） |  |
| **[dsh-ppap-check](https://github.com/PerryLink/dsh-ppap-check)** | PPAP 提交要素齐备性核对（按公开的 PPAP 手册与提交等级核对要素齐备与版本填写，仅提示差异，不作出定性结论） |  |
| **[dsh-protest-deadline](https://github.com/PerryLink/dsh-protest-deadline)** | 质疑与投诉期限核对（按公开的政府采购质疑投诉规定核对期限与台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-railway-window](https://github.com/PerryLink/dsh-railway-window)** | 铁路施工天窗台账核对（按时间窗、时长算术与命令号核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-reach](https://github.com/PerryLink/dsh-reach)** | Multi-channel approval/question bridge: WeChat/Telegram/Feishu, session console | 🧊 已冻结 — 见仓库 README |
| **[dsh-repair-order-qc](https://github.com/PerryLink/dsh-repair-order-qc)** | 维修工单结算核对（按项目金额、配件工时合计与结算总额核对算术自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions |  |
| **[dsh-review-reply-check](https://github.com/PerryLink/dsh-review-reply-check)** | 审稿意见逐条回应覆盖核对（按意见与回应一一对应核对覆盖完整性，仅提示差异，不作出定性结论） |  |
| **[dsh-rulefile-check](https://github.com/PerryLink/dsh-rulefile-check)** | 规则库文件自检核对（按条款引用纪律与效力上限核对规则库自身合规，仅提示差异，不作出定性结论） |  |
| **[dsh-safety-brief-check](https://github.com/PerryLink/dsh-safety-brief-check)** | 安全技术交底记录要素齐备性与签字闭环核对（依据公开的安全生产法规与检查标准，仅提示差异，不作出定性结论） |  |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. |  |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | 🚫 已退役 — 见仓库 README |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. |  |
| **[dsh-site-log-check](https://github.com/PerryLink/dsh-site-log-check)** | 监理日志跨日连续性与旁站覆盖提示（依据 GB/T 50319-2013 等公开文件，仅提示差异，不作出定性结论） |  |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review |  |
| **[dsh-soe-decision-check](https://github.com/PerryLink/dsh-soe-decision-check)** | 三重一大决策台账核对（按前置研究、会议审议与决议记录核对程序留痕，仅提示差异，不作出定性结论） |  |
| **[dsh-soilwater-check](https://github.com/PerryLink/dsh-soilwater-check)** | 土壤与地下水监测台账核对（按点位、监测项目、限值与超标判定核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-sop-sync-check](https://github.com/PerryLink/dsh-sop-sync-check)** | 作业规程与 FMEA／控制计划一致性核对（按编号与版本核对三份文件是否同步，仅提示差异，不作出定性结论） |  |
| **[dsh-spc-gbt-adapter](https://github.com/PerryLink/dsh-spc-gbt-adapter)** | 控制图常数与过程能力指数核对（按 GB/T 4091 的常规控制图常数表核对控制限与 Cp/Cpk 的自洽性，仅提示差异，不作出定性结论） |  |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. |  |
| **[dsh-team-rooms](https://github.com/PerryLink/dsh-team-rooms)** | Cross-session team rooms: shared message bus, task board and timeline | 🚫 已退役 — 见仓库 README |
| **[dsh-tender-extract](https://github.com/PerryLink/dsh-tender-extract)** | 招标文件条款摘录核对（按出处与原文逐字核对摘录完整性，仅提示差异，不作出定性结论） |  |
| **[dsh-tender-matrix](https://github.com/PerryLink/dsh-tender-matrix)** | 评标因素评分矩阵核对（按分值上限与合计核对矩阵自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-test-drive](https://github.com/PerryLink/dsh-test-drive)** | Isolated install-and-smoke test drives for DeepSeek Harness plugins. |  |
| **[dsh-ticktick](https://github.com/PerryLink/dsh-ticktick)** | TickTick/Dida365 task bridge: session-header panel + 11 tools |  |
| **[dsh-translate](https://github.com/PerryLink/dsh-translate)** | Vendor parameter translation and deterministic JSON repair for DeepSeek Harness. |  |
| **[dsh-warranty-calc](https://github.com/PerryLink/dsh-warranty-calc)** | 质保期与索赔金额核对（按质保期月数与里程、索赔金额算式核对自洽，仅提示差异，不作出定性结论） |  |

</details>

</details>

</details>## License

[Apache License 2.0](LICENSE) © 2026 dsh-observe contributors

### 从 DSH Desktop 市场安装

所有 PerryLink 插件均可在 DSH Desktop 内置市场中浏览：**市场 → 来源 → 添加来源 → 粘贴** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ 选中**。安装仍需通过市场的 npm 身份校验与你的确认。
