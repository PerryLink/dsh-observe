/**
 * Package version stamp shared by build artifacts (OTLP instrumentation
 * scope) and the release script. `scripts/release.mjs` bumps this string
 * together with package.json; tests/version.spec.ts trips when the two
 * drift apart.
 * @module dsh-observe/version
 */

/** The dsh-observe package version, kept in sync with package.json. */
export const VERSION = '0.1.4'
