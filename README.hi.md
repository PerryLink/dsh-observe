<div align="center">

# 📊 dsh-observe

**DeepSeek Harness के लिए OpenTelemetry और Langfuse ऑब्ज़र्वेबिलिटी एक्सपोर्टर।**

*सेशन इवेंट्स को OTLP traces और Langfuse observations में बदलें — सैनिटाइज़्ड, बफ़र्ड, डिफ़ॉल्ट रूप से बंद।*

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

| सतह | स्थिति |
|---|---|
| Harness | DeepSeek Harness `0.1.0-rc.8` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| बैकएंड | OpenTelemetry OTLP/HTTP (traces + metrics, JSON एन्कोडिंग) और Langfuse (LLM ऑब्ज़र्वेबिलिटी) — एक या दोनों |
| मॉडल | मॉडल-स्वतंत्र: यह `session/event` स्ट्रीम निर्यात करता है; कोई मॉडल कॉल नहीं करता |

## What you get

`dsh-observe` हार्नेस की `session/event` स्ट्रीम को मानक ऑब्ज़र्वेबिलिटी प्रोटोकॉल में बदलता है:

- **Spans** — turn, step, टूल-कॉल (अवधि, स्थिति, पुनर्प्रयास व्युत्पत्ति) और LLM जनरेशन span, प्रति turn traces में जुड़े, नियतात्मक ids के साथ।
- **Metrics** — प्रति provider/model टोकन काउंटर, USD लागत काउंटर (कॉन्फ़िगर करने योग्य मूल्य तालिका) और `ctx.tokenMeter` से वैकल्पिक कॉन्टेक्स्ट-प्रेशर gauge।
- **सैनिटाइज़्ड कैप्चर** — prompt और completion बॉडी किसी भी कतार या भेजने से पहले रिडैक्ट (संरचनात्मक कुंजी नाम + अंतर्निहित गुप्त पैटर्न + आपके पैटर्न) और ट्रंकेट होते हैं।
- **विश्वसनीयता** — असिंक्रोनस बैचिंग (आकार- और टाइमर-ट्रिगर), एक सीमित टिकाऊ ऑफ़लाइन बफ़र (storage-domain) जिसमें सबसे पुराना पहले हटता है, और नियतात्मक एक्सपोनेंशियल-बैकऑफ पुनर्प्रयास; न पहुँचे बैच रीस्टार्ट के बाद भी बचे रहते हैं।
- **रनटाइम किल स्विच** — वैकल्पिक Typert remote (`observe/status`, `observe/setEnabled`) किसी सेटिंग पृष्ठ को बिना अनमाउंट किए निर्यात रोकने/फिर शुरू करने देता है।
- **डिफ़ॉल्ट रूप से बंद** — `enabled: true` और कम से कम एक बैकएंड ही स्पष्ट ऑप्ट-इन है; अन्यथा कुछ भी कैप्चर या निर्यात नहीं होता।

```text
session/event स्ट्रीम
   │ collector (turn/step/tool/llm spans, मेट्रिक्स)
   │ sanitize (कुंजियाँ, रहस्य, बजट)
   ├──▶ pipeline "otlp"  ── कतार ── flush ──▶ OTLP /v1/traces + /v1/metrics
   │         └─ पुनर्प्रयास/बैकऑफ ─┐
   ├──▶ pipeline "langfuse" ── कतार ── flush ──▶ Langfuse ingestion
   │         └─ पुनर्प्रयास/बैकऑफ ─┤
   └────────── टिकाऊ spool (ऑफ़लाइन बफ़र, सीमित) ◀┘
```

## Quick start

```sh
# 1. बंडल को अपने प्रोफ़ाइल में इंस्टॉल करें
dsh plugin --profile web add "github:PerryLink/dsh-observe#main"

# या npm से (प्रकाशित रिलीज़)
dsh plugin --profile web add dsh-observe

# 2. अपने प्रोफ़ाइल पैच (cordis.yml) में एक बैकएंड कॉन्फ़िगर करें और पुनः आरंभ करें
dsh --profile web
```

न्यूनतम OTLP कॉन्फ़िगरेशन (`cordis.patch.yml` में पंक्ति कमेंट की हुई आती है):

```yaml
- insert:
    - id: dsh-observe
      name: dsh-observe
      config:
        enabled: true
        otlp:
          endpoint: http://localhost:4318
```

फिर सत्यापित करें कि पंक्ति माउंट हुई:

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-observe'
```

## Install & uninstall

- **git चैनल** (नवीनतम `main`): `dsh plugin --profile web add "github:PerryLink/dsh-observe#main"` — `prepare` स्क्रिप्ट केवल प्रोडक्शन निर्भरताओं से बिल्ड करती है।
- **npm चैनल** (प्रकाशित रिलीज़): `dsh plugin --profile web add dsh-observe`।
- **tarball चैनल**: इस रेपो में `pnpm pack`, फिर `dsh plugin --profile web add ./dsh-observe-<version>.tgz`।
- **अनइंस्टॉल**: `dsh plugin --profile web remove dsh-observe` (या प्रोफ़ाइल पैच से पंक्ति हटाएँ)।

> यदि pnpm इस पैकेज के लिए `ERR_PNPM_IGNORED_BUILDS` दिखाता है (esbuild का हानिरहित प्लेटफ़ॉर्म-बाइनरी सत्यापन), तो अपने `pnpm-workspace.yaml` में `allowBuilds: { esbuild: true }` जोड़ें — `dsh` CLI सटीक स्निपेट प्रिंट करता है।

## Configuration

सभी समायोजन Schemastery `Config` फ़ील्ड हैं (cordis.yml से बदले जा सकते हैं)। id-लक्षित ओवरराइड पूरी पंक्ति बदल देता है — ज़रूरत की हर कुंजी फिर से लिखें। `cordis.patch.yml` हर कुंजी को इनलाइन समझाता है।

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | मास्टर स्विच; `true` और कम से कम एक बैकएंड ही स्पष्ट ऑप्ट-इन है |
| `otlp` | `null` | OTLP बैकएंड कॉन्फ़िग, या इसे बंद करने के लिए `null` |
| `otlp.endpoint` | *(आवश्यक)* | OTLP आधार URL; `/v1/traces` और `/v1/metrics` जोड़े जाते हैं |
| `otlp.serviceName` | `deepseek-harness` | `service.name` रिसोर्स एट्रिब्यूट |
| `otlp.serviceVersion` | *(कोई नहीं)* | `service.version` रिसोर्स एट्रिब्यूट |
| `otlp.headers` | `{}` | हर निर्यात अनुरोध में मर्ज किए गए अतिरिक्त हेडर |
| `otlp.timeoutMs` | `10000` | प्रति-अनुरोध टाइमआउट |
| `langfuse` | `null` | Langfuse बैकएंड कॉन्फ़िग, या इसे बंद करने के लिए `null` |
| `langfuse.baseUrl` | `https://cloud.langfuse.com` | Langfuse आधार URL |
| `langfuse.publicKey` | *(आवश्यक)* | प्रोजेक्ट सार्वजनिक कुंजी |
| `langfuse.secretKey` | *(आवश्यक)* | प्रोजेक्ट गुप्त कुंजी |
| `langfuse.release` | *(कोई नहीं)* | traces पर मुहर लगा release टैग |
| `langfuse.timeoutMs` | `10000` | प्रति-अनुरोध टाइमआउट |
| `capture.turns` | `true` | turn जीवनचक्र spans |
| `capture.steps` | `true` | step जीवनचक्र spans |
| `capture.tools` | `true` | सैनिटाइज़्ड तर्कों/परिणामों के साथ टूल-कॉल spans |
| `capture.llm` | `true` | LLM जनरेशन spans |
| `llm.prompt` | `true` | सैनिटाइज़्ड अनुरोध prompt कैप्चर करें (`false` = केवल आकार) |
| `llm.completion` | `true` | सैनिटाइज़्ड completion कैप्चर करें (`false` = केवल आकार) |
| `metadata.sessionId` | `true` | सत्र id एट्रिब्यूट |
| `metadata.cwd` | `false` | सत्र कार्य निर्देशिका (स्थानीय पथ — डिफ़ॉल्ट रूप से बंद) |
| `metadata.agentPreset` | `true` | agent preset id एट्रिब्यूट |
| `metadata.model` | `true` | provider/model एट्रिब्यूट |
| `metrics.tokens` | `true` | प्रति provider/model टोकन काउंटर |
| `metrics.cost` | `true` | USD लागत काउंटर (मिलान के लिए `pricing` नियम चाहिए) |
| `metrics.contextTokens` | `true` | कॉन्टेक्स्ट-प्रेशर gauge (`ctx.tokenMeter` चाहिए) |
| `pricing` | `[]` | मूल्य तालिका, पहला मिलान जीतता है: `{ provider?, model, inputPerToken, outputPerToken, cacheReadPerToken?, cacheWritePerToken? }` |
| `sanitize.enabled` | `true` | रिडैक्शन मास्टर स्विच (`false` केवल रिडैक्शन बंद करता है, ट्रंकेशन कभी नहीं) |
| `sanitize.redactKeys` | `[]` | अतिरिक्त कुंजी-नाम सबस्ट्रिंग (key/token/secret/password/authorization/credential/apiKey हमेशा शामिल) |
| `sanitize.redactPatterns` | `[]` | अतिरिक्त गुप्त नियमित अभिव्यक्तियाँ |
| `sanitize.truncatePromptChars` | `4000` | prompt वर्ण बजट |
| `sanitize.truncateCompletionChars` | `4000` | completion वर्ण बजट |
| `sanitize.truncateToolInputChars` | `2000` | टूल तर्क वर्ण बजट |
| `sanitize.truncateToolOutputChars` | `2000` | टूल परिणाम वर्ण बजट |
| `sanitize.truncateAttributeChars` | `512` | span एट्रिब्यूट स्ट्रिंग बजट |
| `batch.maxRecords` | `256` | कतार में इतने रिकॉर्ड होते ही flush |
| `batch.flushIntervalMs` | `5000` | टाइमर flush अंतराल |
| `batch.maxQueueRecords` | `2000` | इन-मेमोरी कतार सीमा; अतिरिक्त बफ़र में जाता है |
| `batch.maxBufferRecords` | `10000` | टिकाऊ ऑफ़लाइन बफ़र सीमा; सबसे पुराने रिकॉर्ड पहले गिरते हैं |
| `batch.bufferRetryIntervalMs` | `30000` | ऑफ़लाइन बफ़र पुनर्प्रयास अंतराल |
| `retry.maxAttempts` | `5` | प्रति बैच प्रयास, पहली कोशिश सहित |
| `retry.baseDelayMs` | `1000` | पहला बैकऑफ विलंब |
| `retry.factor` | `2` | प्रति लगातार विफलता बैकऑफ गुणक |
| `retry.maxDelayMs` | `60000` | बैकऑफ सीमा |
| `remote.enabled` | `false` | `observe` Typert remote माउंट करें (किल स्विच) |

## Tools & surfaces

यह प्लगइन **कोई मॉडल टूल पंजीकृत नहीं करता** — यह एक पृष्ठभूमि निर्यातक है। इसकी सतहें:

- **उपभोग करता है** `session/event` (span/metric संग्रह), `session/flush` (बेस्ट-एफ़र्ट निर्यात किक — टिकाऊपन चेकपॉइंट कभी दूरस्थ बैकएंड का इंतज़ार नहीं करता) और `session/disposed`।
- **वैकल्पिक remote सेवा** `observe` — `observe/status` किल-स्विच स्थिति, कॉन्फ़िगर किए बैकएंड, कतार गहराई और बफ़र अधिभोग लौटाता है; `observe/setEnabled` रनटाइम पर निर्यात रोकता/फिर शुरू करता है।

## Permissions & data

- **अनुमतियाँ**: आपके कॉन्फ़िगर किए एंडपॉइंट तक `network:outbound`, इवेंट स्ट्रीम के लिए `session:read`, ऑफ़लाइन बफ़र के लिए `storage:write`; कोई नेटिव कोड नहीं, कोई फ़ाइल-सिस्टम पहुँच नहीं।
- **डेटा**: भेजी गई हर चीज़ सत्र लॉग से निकलती है और कतारबद्ध, बफ़र या प्रेषित होने से पहले सैनिटाइज़ होती है (रिडैक्शन + ट्रंकेशन)। ऑफ़लाइन बफ़र केवल सैनिटाइज़्ड रिकॉर्ड रखता है, जो पढ़े जाने पर फिर से सत्यापित होते हैं।
- **क्रेडेंशियल**: Langfuse सार्वजनिक/गुप्त कुंजियाँ केवल कॉन्फ़िगर किए Langfuse एंडपॉइंट तक जाती हैं; OTLP हेडर केवल कॉन्फ़िगर किए OTLP एंडपॉइंट तक। प्लगइन स्वयं कोई क्रेडेंशियल नहीं रखता — उन्हें क्रेडेंशियल संदर्भों या पर्यावरण-इंजेक्ट मानों में रखें।

## Security boundaries

- **डिफ़ॉल्ट रूप से बंद** — स्पष्ट ऑप्ट-इन के बिना कुछ भी कैप्चर या निर्यात नहीं होता।
- **भेजने से पहले सैनिटाइज़** — संरचनात्मक कुंजी रिडैक्शन, अंतर्निहित गुप्त पैटर्न (API कुंजियाँ, GitHub टोकन, AWS कुंजियाँ, bearer क्रेडेंशियल, निजी कुंजियाँ), आपके पैटर्न और वर्ण बजट सभी किसी भी रिकॉर्ड के मेमोरी छोड़ने से पहले लागू होते हैं।
- **टिकाऊ सीमा पर पुनः सत्यापन** — स्टोरेज से पढ़े रिकॉर्ड किसी sink के देखने से पहले फिर जाँचे जाते हैं।
- **विफलता ज़ोर से, विफलता सीमित** — निर्यात विफलताएँ चेतावनी देती हैं, गिनती करती हैं, पुनर्प्रयास करती हैं और अंत में spool में जाती हैं; विफल सत्र हैंडलर पकड़ा और लॉग होता है, इसलिए ऑब्ज़र्वेबिलिटी कभी हार्नेस का हॉट पाथ नहीं तोड़ सकती।
- **Model-visible ⟺ logged** — prompt/completion निर्यात केवल लॉग किए हेडर और सत्र सतह को प्रोजेक्ट करते हैं; निर्यातक कोई सामग्री नहीं गढ़ता।

## Known limitations

- **केवल rc.8** — प्लगइन `@deepseek-ai/dsh@0.1.0-rc.8` के विरुद्ध विकसित और परीक्षित है; नए हार्नेस बेसलाइन काम करने चाहिए और मासिक compat वर्कफ़्लो उन्हें सत्यापित करता है।
- **मेट्रिक्स पुनर्प्रयास/spool पथ से बचती हैं** — OTLP मेट्रिक्स संचयी रूप से एकत्र होती हैं, इसलिए खोया flush अगले में स्वयं-सुधर जाता है (डिज़ाइन से, बग नहीं)।
- **कोई सैंपलिंग नहीं** — हर सक्षम span परिवार निर्यात होता है; उच्च-मात्रा सत्रों के लिए `capture.*` स्विच और `batch.maxBufferRecords` समायोजित करें।

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc: src + tests स्थानीय हार्नेस चेकआउट के विरुद्ध
pnpm run typecheck:ci  # tsc प्रकाशित 0.1.0-rc.8 प्रकारों के विरुद्ध (बिना paths)
pnpm test           # vitest: 95 टेस्ट, 13 सुइट (वास्तविक Context/Session/storage seam)
pnpm run test:coverage  # कवरेज द्वार (90/80/90/90)
pnpm run build      # tsdown बंडल + tsc घोषणाएँ (lib/)
pnpm run verify:self-contained  # निर्भरता स्पेक registry से हल होती हैं
pnpm run verify:artifacts       # निर्मित ESM फ़ेस + बंडल पैच मौजूद
node scripts/check-readme-sync.mjs  # पाँच-भाषा README समन्वय द्वार
pnpm pack           # प्रकाशित tarball
```

## Topics

`dsh`, `dsh-plugin`, `deepseek-harness`, `deepseek`, `cordis`, `observability`, `opentelemetry`, `otlp`, `langfuse`, `tracing`

## Contributors

- [@PerryLink](https://github.com/PerryLink) — निर्माता और मेंटेनर: collector, pipelines, spool, OTLP/Langfuse sinks, सैनिटाइज़ेशन और पाँच-भाषा दस्तावेज़।

## PerryLink DSH Plugin Family

यह प्रोजेक्ट [PerryLink](https://github.com/PerryLink) द्वारा अनुरक्षित [29 DeepSeek Harness प्लगइनों](https://github.com/PerryLink) में से एक है। अगर यह आपकी मदद करता है, तो बाकी भी करेंगे:

| Plugin | One-liner |
|---|---|
| [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) | अनुमोदन श्रृंखला पर दूसरे मॉडल से स्वतः-समीक्षा, डिफ़ॉल्ट रूप से असफल-बंद |
| [dsh-background-agents](https://github.com/PerryLink/dsh-background-agents) | Web UI साइडबार, संदेश और रुकावट के साथ स्थायी पृष्ठभूमि चाइल्ड एजेंट |
| [dsh-budget](https://github.com/PerryLink/dsh-budget) | DeepSeek Harness के लिए लागत प्रशासन: बजट, कार्बन और विलंबता एक पैनल में। |
| [dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind) | Claude Code /rewind-समतुल्य: स्नैपशॉट, सत्र फोर्क, एक-बार पुनर्स्थापन |
| [dsh-claude-move](https://github.com/PerryLink/dsh-claude-move) | Claude Code सत्र, स्मृति, skills और CLAUDE.md को DSH में स्थानांतरित करें |
| [dsh-click](https://github.com/PerryLink/dsh-click) | DeepSeek Harness के लिए क्रॉस-प्लेटफ़ॉर्म नेटिव डेस्कटॉप नियंत्रण — Windows पहले। |
| [dsh-composer-history](https://github.com/PerryLink/dsh-composer-history) | Web कंपोज़र के लिए टर्मिनल-शैली इनपुट इतिहास: तीर, Ctrl+R खोज |
| [dsh-defend](https://github.com/PerryLink/dsh-defend) | DeepSeek Harness के लिए प्रॉम्प्ट-इंजेक्शन, जेलब्रेक और सीक्रेट-लीक रक्षा। |
| [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | इंजीनियरिंग-अनुशासन गार्ड: आवश्यकताएँ पूछताछ, परीक्षण द्वार, विरोधी समीक्षा |
| [dsh-draw](https://github.com/PerryLink/dsh-draw) | DeepSeek Harness के लिए एकीकृत स्थैतिक-छवि निर्माण रूटिंग। |
| [dsh-fast](https://github.com/PerryLink/dsh-fast) | DeepSeek Harness के लिए केवल-पठन प्रदर्शन निदान। |
| [dsh-github](https://github.com/PerryLink/dsh-github) | DSH के लिए GitHub PR/issues एकीकरण, हर लेखन अनुमोदन-द्वारित |
| [dsh-library](https://github.com/PerryLink/dsh-library) | DeepSeek Harness के लिए स्थानीय दस्तावेज़ ज्ञानकोश। |
| [dsh-local-ai](https://github.com/PerryLink/dsh-local-ai) | DeepSeek Harness के लिए स्थानीय-मॉडल (Ollama) एकीकरण। |
| [dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions) | भाषा सर्वरों पर LSP निदान, फ़ॉर्मेटिंग, पूर्णता, कोड क्रियाएँ और नाम बदलना |
| [dsh-mask](https://github.com/PerryLink/dsh-mask) | DeepSeek Harness के लिए PII मास्किंग मिडलवेयर — मॉडल तक पहुँचने से पहले व्यक्तिगत डेटा अनाम करता है, प्रदर्शन परत पर बहाल करता है। |
| [dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel) | केवल-पठन MCP रनटाइम पैनल: /mcp कमांड + स्थिति, टूल और त्रुटियों वाला सेटिंग टैब |
| [dsh-memento](https://github.com/PerryLink/dsh-memento) | अनुमोदन-द्वारित क्रॉस-सत्र स्मृति: ctx.memory seam + SQLite + memory टूल |
| **[dsh-observe](https://github.com/PerryLink/dsh-observe)** | DeepSeek Harness के लिए OpenTelemetry और Langfuse अवलोकनीयता निर्यातक। |
| [dsh-output-styles](https://github.com/PerryLink/dsh-output-styles) | Claude Code outputStyles-समतुल्य रनटाइम शैली स्विचिंग |
| [dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules) | Claude Code-शैली घोषणात्मक allow/deny/ask अनुमति नियम, ऑडिट के साथ |
| [dsh-plugin-guide](https://github.com/PerryLink/dsh-plugin-guide) | माँग-पर एजेंट स्किल के रूप में प्लगइन-विकास ज्ञानकोश |
| [dsh-score](https://github.com/PerryLink/dsh-score) | DeepSeek Harness प्लगइनों के लिए बहु-आयामी गुणवत्ता स्कोरिंग। |
| [dsh-session-pin](https://github.com/PerryLink/dsh-session-pin) | Web साइडबार में सत्र पिन करें, स्थायी क्रम के साथ |
| [dsh-session-sync](https://github.com/PerryLink/dsh-session-sync) | DeepSeek Harness के लिए क्रॉस-डिवाइस सत्र सिंक — आपके सत्र स्टोर का एक समर्पित git मिरर। |
| [dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security) | सुरक्षा-ऑडिट स्किल पैक: सीक्रेट स्कैन, निर्भरता और आपूर्ति-श्रृंखला समीक्षा |
| [dsh-talk](https://github.com/PerryLink/dsh-talk) | DeepSeek Harness के लिए आवाज़-प्रथम सत्र लूप: बोलें और उत्तर सुनें। |
| [dsh-test-drive](https://github.com/PerryLink/dsh-test-drive) | DeepSeek Harness प्लगइनों के लिए पृथक इंस्टॉल-और-स्मोक परीक्षण। |
| [dsh-translate](https://github.com/PerryLink/dsh-translate) | DeepSeek Harness के लिए वेंडर पैरामीटर अनुवाद और नियतात्मक JSON मरम्मत। |

## License

[Apache License 2.0](LICENSE) © 2026 dsh-observe contributors
