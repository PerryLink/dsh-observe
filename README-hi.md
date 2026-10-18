<div align="center">

# 📊 dsh-observe
- **1024 स्टोर चैनल**: एक बार `npm i -g dsh1024`, फिर `dsh1024 plugin --profile web add dsh-observe` ([deepseek1024.com](https://deepseek1024.com) इंस्टॉल रैंकिंग में गिना जाता है)।

**DeepSeek Harness के लिए OpenTelemetry और Langfuse ऑब्ज़र्वेबिलिटी एक्सपोर्टर।**

*सेशन इवेंट्स को OTLP traces और Langfuse observations में बदलें — सैनिटाइज़्ड, बफ़र्ड, डिफ़ॉल्ट रूप से बंद।*

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
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-observe?metric=downloads&lang=hi)](https://dshfind.com/hi/plugins/PerryLink/dsh-observe?ref=badge)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```sh
dsh plugin --profile <name> add dsh-observe
```


</div>

---


**📖 इकोसिस्टम नॉलेज बेस** — मापे गए आँकड़े, मार्केटिंग नहीं: [डेवलपमेंट गाइड · चयन डेटा · रखरखाव मानदंड](https://perrylink.github.io/dsh-plugin-guide/)।

<!-- star-cta -->
## Install & uninstall

- **git चैनल** (नवीनतम `main`): `dsh plugin --profile web add github:PerryLink/dsh-observe` — `prepare` स्क्रिप्ट केवल प्रोडक्शन निर्भरताओं से बिल्ड करती है।
- **npm चैनल** (प्रकाशित रिलीज़): `dsh plugin --profile web add dsh-observe`।
- **tarball चैनल**: इस रेपो में `pnpm pack`, फिर `dsh plugin --profile web add ./dsh-observe-<version>.tgz`।
- **अनइंस्टॉल**: `dsh plugin --profile web remove dsh-observe` (या प्रोफ़ाइल पैच से पंक्ति हटाएँ)।

> यदि pnpm इस पैकेज के लिए `ERR_PNPM_IGNORED_BUILDS` दिखाता है (esbuild का हानिरहित प्लेटफ़ॉर्म-बाइनरी सत्यापन), तो अपने `pnpm-workspace.yaml` में `allowBuilds: { esbuild: true }` जोड़ें — `dsh` CLI सटीक स्निपेट प्रिंट करता है।

## ⭐ 如果它帮到了你

यह प्लगइन [DSH प्लगइन परिवार](https://github.com/PerryLink) का हिस्सा है (95 प्लगइन, सभी Apache-2.0)। अगर यह उपयोगी लगे, तो **एक स्टार दें** — इससे कोई सुविधा अनलॉक नहीं होती, पर अगला व्यक्ति इसे खोज में आसानी से पा लेता है।

*English:* part of a 95 plugin family for DeepSeek Harness. If it is useful, **a star helps the next person find it** — nothing is gated behind it.

## What is dsh-observe?

DeepSeek Harness के लिए OpenTelemetry और Langfuse ऑब्ज़र्वेबिलिटी एक्सपोर्टर।

सेशन इवेंट्स को OTLP traces और Langfuse observations में बदलें — सैनिटाइज़्ड, बफ़र्ड, डिफ़ॉल्ट रूप से बंद।

![dsh-observe का टर्मिनल डेमो: dsh-observe — opt in, point OTLP at your collector](https://raw.githubusercontent.com/PerryLink/dsh-observe/main/docs/assets/dsh-observe-hero.png)

![Animated terminal demo of dsh-observe](https://raw.githubusercontent.com/PerryLink/dsh-observe/main/docs/assets/dsh-observe-demo.gif)

*वही रन, एनिमेटेड।*

## Compatibility

| सतह | स्थिति |
|---|---|
| Harness | DeepSeek Harness `dsh-v0.2.1-alpha.1` (2026-10-04 को अनुकूलित): सत्र प्रारूप V4 टूल परिणाम को प्रथम-श्रेणी `role: 'tool'` संदेश के रूप में रखता है जिसमें शीर्ष-स्तर पर `toolCallId` + `content` + वैकल्पिक `isError` होता है — V3 का `tool-result` कंटेंट ब्लॉक होस्ट के `ContentBlockMap` से हट चुका है, और यह प्लगइन केवल V4 आकार पढ़ता है (अपग्रेड-पूर्व V3 लॉग अभी भी केवल-पठन संगतता पथ से प्रोजेक्ट होता है)। सत्र प्रारूप V3 के शेष लक्षण जारी हैं: सहायक स्ट्रीम `assistant/message` / `assistant/attempt` में एम्बेड होती है और सिस्टम प्रॉम्प्ट सरफ़ेस नोड 0 (`system/message`) है; प्लगइन केवल लाइव इवेंट स्ट्रीम पढ़ता है और कभी सत्र लॉग फ़ाइलें नहीं पढ़ता। peer रेंज `>=0.1.2-rc.1 <0.2.0 \|\| >=0.1.5-alpha.1 <0.2.0 \|\| >=0.1.6-0 <0.2.0 \|\| >=0.1.7-0 <0.2.0` हर प्रकाशित लाइन को इंस्टॉल-योग्य रखती है (स्थानीय पूर्ण गेट श्रृंखला; प्रोफ़ाइल इंस्टॉल स्मोक compat वर्कफ़्लो कवर करता है)। |
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
dsh plugin --profile web add github:PerryLink/dsh-observe
```

```sh
# 1. बंडल को अपने प्रोफ़ाइल में इंस्टॉल करें
dsh plugin --profile web add github:PerryLink/dsh-observe

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
| `langfuse.traceName` | `session {session} turn {turn}` | trace नाम टेम्पलेट; `{session}`/`{turn}` हर trace पर इंटरपोलेट होते हैं |
| `langfuse.tags` | `[]` | हर trace पर मुहर लगे स्थिर टैग |
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
- **Model-visible ⟺ logged** — prompt/completion निर्यात केवल सत्र सरफ़ेस (जिसका नोड 0 सिस्टम प्रॉम्प्ट है) और लॉग किए हेडर (कॉल कॉन्फ़िग और टूल्स) को प्रोजेक्ट करते हैं; निर्यातक कोई सामग्री नहीं गढ़ता।

## Known limitations

- **npm 0.1.7-rc.2** — प्लगइन `@deepseek-ai/dsh@0.1.7-rc.2` के विरुद्ध विकसित और परीक्षित है (devDeps और CI की मुख्य रूलर); peer रेंज `>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-0 <0.2.0 || >=0.1.7-0 <0.2.0` हर प्रकाशित लाइन को इंस्टॉल-योग्य रखती है, और दूसरी रूलर (`typecheck:ci`) तथा compat वर्कफ़्लो पुराने बेसलाइन कवर करते हैं।
- **ऑडिट इवेंट्स संग्रहीत नहीं होते** — एक्सपोर्टर के स्वयं के `observe/*` रिकॉर्ड केवल ऑडिट के लिए हैं: वर्तमान होस्ट लाइन पर सत्र append गेट केवल सरफ़ेस इवेंट स्वीकार करता है, इसलिए कोई `observe/*` इवेंट सत्र लॉग में नहीं लिखा जाता, और प्लगइन बिना मार्क के append से इसे नकली नहीं बनाता (इससे सत्र अपठनीय हो जाते)। ऑडिट सतह के लिए `/observe` स्टेटस आउटपुट और OTLP/Langfuse बैकएंड देखें।
- **मेट्रिक्स पुनर्प्रयास/spool पथ से बचती हैं** — OTLP मेट्रिक्स संचयी रूप से एकत्र होती हैं, इसलिए खोया flush अगले में स्वयं-सुधर जाता है (डिज़ाइन से, बग नहीं)।
- **कोई सैंपलिंग नहीं** — हर सक्षम span परिवार निर्यात होता है; उच्च-मात्रा सत्रों के लिए `capture.*` स्विच और `batch.maxBufferRecords` समायोजित करें।

## Development

```sh
pnpm install        # node ^22.19 || >=24
pnpm run typecheck  # tsc: src + tests 0.1.7-rc.2 devDeps के विरुद्ध (कोई tsconfig paths नहीं)
pnpm run typecheck:ci  # tsc प्रकाशित लाइन के विरुद्ध (बिना paths)
pnpm run check:ruler-live  # कैनरी: कंपाइल विफल होना चाहिए, यह सिद्ध करते हुए कि रूलर जीवित है
pnpm test           # vitest: 126 टेस्ट, 18 सुइट (वास्तविक Context/Session/storage seam)
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

यह प्रोजेक्ट [PerryLink](https://github.com/PerryLink) के **87 सक्रिय रूप से अनुरक्षित** DeepSeek Harness प्लगइन में से एक है। पूरा परिवार **95** प्लगइन है — **5 फ़्रोज़न**, **3 सेवानिवृत्त** — और नीचे संक्षिप्त रखा गया है ताकि हर README की पहली स्क्रीन छोटी रहे। हर पंक्ति देखने के लिए इसे खोलें; कारण स्थिति कॉलम में है।

<details>
<summary>सभी 95 प्लगइन खोलें</summary>

| प्लगइन | एक पंक्ति | स्थिति |
|---|---|---|
| **[dsh-aqua-input-check](https://github.com/PerryLink/dsh-aqua-input-check)** | 水产养殖投入品记录核对（按投入品用量、休药期与起捕间隔核对记录自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-archive-check](https://github.com/PerryLink/dsh-archive-check)** | 档案归档完整性与保管期限核对（依据《档案法》及配套规定，仅提示差异，不作出定性结论） |  |
| **[dsh-auto-review](https://github.com/PerryLink/dsh-auto-review)** | Second-model auto-review on the approval chain, fail-closed by default |  |
| **[dsh-autotier](https://github.com/PerryLink/dsh-autotier)** | Automatic strong/cheap model-tier routing with deterministic risk guards and a `/tier` command |  |
| **[dsh-background-agents](https://github.com/PerryLink/dsh-background-agents)** | Durable background child agents with a Web UI sidebar, messaging and interrupt | 🚫 सेवानिवृत्त — रिपॉज़िटरी README देखें |
| **[dsh-bid-ca-precheck](https://github.com/PerryLink/dsh-bid-ca-precheck)** | 投标文件符合性预检（按招标文件逐条核对响应情况，仅提示差异，不作出定性结论） |  |
| **[dsh-bid-qual-check](https://github.com/PerryLink/dsh-bid-qual-check)** | 投标人资格条件核对（按资格条件与证明材料核对逐条响应，仅提示差异，不作出定性结论） |  |
| **[dsh-budget](https://github.com/PerryLink/dsh-budget)** | Cost governance for DeepSeek Harness: budgets, carbon, and latency in one panel. | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-cert-mcp](https://github.com/PerryLink/dsh-cert-mcp)** | Read-only MCP server exposing the certification registry: grades, snapshots and five-dimension evidence |  |
| **[dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)** | Claude Code /rewind-equivalent: snapshots, session forks, one-shot restore |  |
| **[dsh-claude-move](https://github.com/PerryLink/dsh-claude-move)** | Migrate Claude Code sessions, memory, skills and CLAUDE.md into DSH | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-click](https://github.com/PerryLink/dsh-click)** | Cross-platform native desktop control for DeepSeek Harness — Windows first. |  |
| **[dsh-composer-history](https://github.com/PerryLink/dsh-composer-history)** | Terminal-style input history for the web composer: arrows, Ctrl+R search |  |
| **[dsh-contract-stance](https://github.com/PerryLink/dsh-contract-stance)** | 合同条款立场台账核对（按立场、风险等级与退让底线核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-customs-doc-check](https://github.com/PerryLink/dsh-customs-doc-check)** | 报关单证一致性核对（按公开的报关单填制规范核对单证间字段一致性，仅提示差异，不作出定性结论） |  |
| **[dsh-data-quality](https://github.com/PerryLink/dsh-data-quality)** | Dataset quality checks and citation cross-checks (the optional numeric bridge consumed here) |  |
| **[dsh-defend](https://github.com/PerryLink/dsh-defend)** | Prompt-injection, jailbreak, and secret-leak defense for DeepSeek Harness. | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-demurrage-ledger](https://github.com/PerryLink/dsh-demurrage-ledger)** | 滞箱费台账核对（按免箱期与费率核对超期天数与金额的自洽性，仅提示差异，不作出定性结论） |  |
| **[dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)** | Engineering-discipline guard: requirements grill, test gates, adversary review |  |
| **[dsh-draw](https://github.com/PerryLink/dsh-draw)** | Unified static-image generation routing for DeepSeek Harness. | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
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
| **[dsh-reach](https://github.com/PerryLink/dsh-reach)** | Multi-channel approval/question bridge: WeChat/Telegram/Feishu, session console | 🧊 फ़्रोज़न — रिपॉज़िटरी README देखें |
| **[dsh-repair-order-qc](https://github.com/PerryLink/dsh-repair-order-qc)** | 维修工单结算核对（按项目金额、配件工时合计与结算总额核对算术自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-research-report](https://github.com/PerryLink/dsh-research-report)** | Verifiable research-report engine: content-addressed evidence ledger and sealed versions |  |
| **[dsh-review-reply-check](https://github.com/PerryLink/dsh-review-reply-check)** | 审稿意见逐条回应覆盖核对（按意见与回应一一对应核对覆盖完整性，仅提示差异，不作出定性结论） |  |
| **[dsh-rulefile-check](https://github.com/PerryLink/dsh-rulefile-check)** | 规则库文件自检核对（按条款引用纪律与效力上限核对规则库自身合规，仅提示差异，不作出定性结论） |  |
| **[dsh-safety-brief-check](https://github.com/PerryLink/dsh-safety-brief-check)** | 安全技术交底记录要素齐备性与签字闭环核对（依据公开的安全生产法规与检查标准，仅提示差异，不作出定性结论） |  |
| **[dsh-score](https://github.com/PerryLink/dsh-score)** | Multi-dimensional quality scoring for DeepSeek Harness plugins. |  |
| **[dsh-session-pin](https://github.com/PerryLink/dsh-session-pin)** | Pin sessions in the Web sidebar with durable ordering | 🚫 सेवानिवृत्त — रिपॉज़िटरी README देखें |
| **[dsh-session-sync](https://github.com/PerryLink/dsh-session-sync)** | Cross-device session sync for DeepSeek Harness — a dedicated git mirror of your session store. |  |
| **[dsh-site-log-check](https://github.com/PerryLink/dsh-site-log-check)** | 监理日志跨日连续性与旁站覆盖提示（依据 GB/T 50319-2013 等公开文件，仅提示差异，不作出定性结论） |  |
| **[dsh-skill-pack-security](https://github.com/PerryLink/dsh-skill-pack-security)** | Security-audit skill pack: secret scan, dependency and supply-chain review |  |
| **[dsh-soe-decision-check](https://github.com/PerryLink/dsh-soe-decision-check)** | 三重一大决策台账核对（按前置研究、会议审议与决议记录核对程序留痕，仅提示差异，不作出定性结论） |  |
| **[dsh-soilwater-check](https://github.com/PerryLink/dsh-soilwater-check)** | 土壤与地下水监测台账核对（按点位、监测项目、限值与超标判定核对台账自洽，仅提示差异，不作出定性结论） |  |
| **[dsh-sop-sync-check](https://github.com/PerryLink/dsh-sop-sync-check)** | 作业规程与 FMEA／控制计划一致性核对（按编号与版本核对三份文件是否同步，仅提示差异，不作出定性结论） |  |
| **[dsh-spc-gbt-adapter](https://github.com/PerryLink/dsh-spc-gbt-adapter)** | 控制图常数与过程能力指数核对（按 GB/T 4091 的常规控制图常数表核对控制限与 Cp/Cpk 的自洽性，仅提示差异，不作出定性结论） |  |
| **[dsh-talk](https://github.com/PerryLink/dsh-talk)** | Voice-first session loop for DeepSeek Harness: talk to it, hear it answer. |  |
| **[dsh-team-rooms](https://github.com/PerryLink/dsh-team-rooms)** | Cross-session team rooms: shared message bus, task board and timeline | 🚫 सेवानिवृत्त — रिपॉज़िटरी README देखें |
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

### DSH Desktop मार्केट से इंस्टॉल करें

सभी PerryLink प्लगइन DSH Desktop के बिल्ट-इन मार्केट में देखे जा सकते हैं: **Market → Sources → add source → पेस्ट करें** `https://perrylink-dsh-catalog.perrylink.workers.dev/catalog-source.json` **→ चुनें**। इंस्टॉलेशन मार्केट के npm-identity सत्यापन और आपकी पुष्टि से ही होता है।
