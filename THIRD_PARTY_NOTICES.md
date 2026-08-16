# Third-party notices

`dsh-observe` bundles no third-party source code. All TypeScript/JavaScript
sources in this repository are original works by the dsh-observe
contributors, licensed under Apache-2.0 (see `LICENSE`).

The package depends on the following software. None of it is bundled into the
published tarball; these are install-time dependencies:

| Package | Version range | License | Purpose |
|---|---|---|---|
| [tsdown](https://github.com/rolldown/tsdown) | `^0.22.14` | MIT | Build-time bundling of `lib/` (a regular dependency so the git-install channel's `prepare` script can build) |
| [typescript](https://github.com/microsoft/TypeScript) | `^5.9.0` | Apache-2.0 | Build-time declaration emission (`lib/types/`) |
| [zod](https://github.com/colinhacks/zod) | `^4.4.3` | MIT | Runtime value schema for the durable offline-buffer domain table |
| [@deepseek-ai/cordis](https://www.npmjs.com/package/@deepseek-ai/cordis) | `^4.0.1` (peer) | See package | The plugin runtime |
| [@deepseek-ai/schemastery](https://www.npmjs.com/package/@deepseek-ai/schemastery) | `^3.18.0` (peer) | See package | Configuration schema |
| `@deepseek-ai/dsh-*` peers | `0.1.0-rc.6` (peer) | See packages | Official harness seams (`dsh-session`, `dsh-llm`, `dsh-storage-domain`, `dsh-typert-protocol`) |

At runtime the plugin only talks to the harness services listed as
peerDependencies and to the observability endpoints **you** configure; it
performs no other network requests.
