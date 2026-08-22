<div align="center">

# 📊 dsh-observe

**DeepSeek Harness 的 OpenTelemetry 与 Langfuse 可观测性导出器。**

*把会话事件变成 OTLP 追踪与 Langfuse 观测 —— 脱敏、缓冲、默认关闭。*

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

| 方面 | 状态 |
|---|---|
| Harness | DeepSeek Harness `0.1.0-rc.8` |
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
# 1. 把 bundle 装进你的 profile
dsh plugin --profile web add "github:PerryLink/dsh-observe#main"

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

## Install & uninstall

- **git 通道**（最新 `main`）：`dsh plugin --profile web add "github:PerryLink/dsh-observe#main"` —— `prepare` 脚本仅用生产依赖构建。
- **npm 通道**（正式发布版）：`dsh plugin --profile web add dsh-observe`。
- **tarball 通道**：在本仓库执行 `pnpm pack`，然后 `dsh plugin --profile web add ./dsh-observe-<version>.tgz`。
- **卸载**：`dsh plugin --profile web remove dsh-observe`（或从 profile patch 中删除该行）。

> 如果 pnpm 对本包报 `ERR_PNPM_IGNORED_BUILDS`（esbuild 的平台二进制无害校验），在你的 `pnpm-workspace.yaml` 中加入 `allowBuilds: { esbuild: true }` —— `dsh` CLI 会打印确切片段。

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
- **模型可见 ⟺ 已记录** —— prompt/completion 导出只投影已记录的 header 与会话 surface；导出器不发明任何内容。

## Known limitations

- **仅 rc.8** —— 插件针对 `@deepseek-ai/dsh@0.1.0-rc.8` 开发与测试；更新的 harness 基线预期可用，由月度 compat 工作流验证。
- **Metrics 不走重试/缓冲路径** —— OTLP metrics 按累计聚合，丢失一次 flush 会在下一次自愈（设计如此，非缺陷）。
- **无采样** —— 每个启用的 span 族都会导出；大流量会话请调整 `capture.*` 开关与 `batch.maxBufferRecords`。

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc：src + tests，对照本地 harness checkout
pnpm run typecheck:ci  # tsc：对照已发布的 0.1.0-rc.8 类型（无 paths）
pnpm test           # vitest：95 个测试、13 个套件（真实 Context/Session/storage 接缝）
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

本项目是由 [PerryLink](https://github.com/PerryLink) 维护的 [29 个 DeepSeek Harness 插件](https://github.com/PerryLink)之一。如果这个对你有用，其他插件很可能也会：

| Plugin | One-liner |
|---|---|
| [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) | 审批链上的第二模型自动审查，默认失败关闭 |
| [dsh-background-agents](https://github.com/PerryLink/dsh-background-agents) | 持久化后台子代理，带 Web UI 侧边栏、消息与打断 |
| [dsh-budget](https://github.com/PerryLink/dsh-budget) | DeepSeek Harness 的成本治理：预算、碳排与延迟一屏呈现。 |
| [dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind) | Claude Code /rewind 等价物：快照、会话分叉、一次性恢复 |
| [dsh-claude-move](https://github.com/PerryLink/dsh-claude-move) | 将 Claude Code 会话、记忆、技能与 CLAUDE.md 迁入 DSH |
| [dsh-click](https://github.com/PerryLink/dsh-click) | 跨平台原生桌面控制（DeepSeek Harness），Windows 优先。 |
| [dsh-composer-history](https://github.com/PerryLink/dsh-composer-history) | Web 输入框的终端式输入历史：方向键、Ctrl+R 搜索 |
| [dsh-defend](https://github.com/PerryLink/dsh-defend) | DeepSeek Harness 的提示注入、越狱与密钥泄露防护。 |
| [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | 工程纪律门禁：需求质询、测试门禁、对抗式审查 |
| [dsh-draw](https://github.com/PerryLink/dsh-draw) | DeepSeek Harness 的统一静态图像生成路由。 |
| [dsh-fast](https://github.com/PerryLink/dsh-fast) | DeepSeek Harness 的只读性能诊断。 |
| [dsh-github](https://github.com/PerryLink/dsh-github) | DSH 的 GitHub PR/issue 集成，每次写入都经审批门 |
| [dsh-library](https://github.com/PerryLink/dsh-library) | DeepSeek Harness 的本地文档知识库。 |
| [dsh-local-ai](https://github.com/PerryLink/dsh-local-ai) | DeepSeek Harness 的本地模型（Ollama）接入。 |
| [dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions) | 经语言服务器的 LSP 诊断、格式化、补全、代码操作与重命名 |
| [dsh-mask](https://github.com/PerryLink/dsh-mask) | DeepSeek Harness 的 PII 脱敏中间件——数据到模型前匿名化，展示层还原。 |
| [dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel) | 只读 MCP 运行时面板：/mcp 命令 + 带状态、工具与错误的设置页 |
| [dsh-memento](https://github.com/PerryLink/dsh-memento) | 带审批门的跨会话记忆：ctx.memory 接缝 + SQLite + memory 工具 |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | DeepSeek Harness 的 OpenTelemetry 与 Langfuse 可观测导出器。 |
| [dsh-output-styles](https://github.com/PerryLink/dsh-output-styles) | Claude Code outputStyles 等价的运行时样式切换 |
| [dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules) | Claude Code 风格声明式 allow/deny/ask 权限规则，带审计 |
| [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | 按需 agent 技能形式的插件开发知识库 |
| [dsh-score](https://github.com/PerryLink/dsh-score) | DeepSeek Harness 插件的多指标质量评分。 |
| [dsh-session-pin](https://github.com/PerryLink/dsh-session-pin) | 在 Web 侧边栏置顶会话，顺序持久化 |
| [dsh-session-sync](https://github.com/PerryLink/dsh-session-sync) | DeepSeek Harness 的跨设备会话同步——会话存储的专用 git 镜像。 |
| [dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security) | 安全审计技能包：密钥扫描、依赖与供应链审查 |
| [dsh-talk](https://github.com/PerryLink/dsh-talk) | DeepSeek Harness 的语音优先会话闭环：对它说，听它答。 |
| [dsh-test-drive](https://github.com/PerryLink/dsh-test-drive) | DeepSeek Harness 插件的隔离式安装冒烟实测。 |
| [dsh-translate](https://github.com/PerryLink/dsh-translate) | DeepSeek Harness 的厂商参数翻译与确定性 JSON 修复。 |

## License

[Apache License 2.0](LICENSE) © 2026 dsh-observe contributors
