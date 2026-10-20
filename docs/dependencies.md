# Dependency review

Reviewed on 2026-10-20 during the behavior-preserving refactor.

## Runtime assets

The viewer ships Pele 1.6.0, Mermaid 11.16.1, and jsPDF 4.2.1. Their versions and
JavaScript bytes are unchanged by the refactor to preserve diagram layout and
export behavior. They are development dependencies because the extension ships
vendored assets and does not install `node_modules` at runtime.

`public/vendor/manifest.json` records package versions, declared licenses, and
SHA-256 hashes for every distributed vendor asset. `bun run check:vendor` compares
the manifest and assets with the installed packages; packaging runs this check.
The manifest describes distributed files, not a complete inventory of libraries
embedded inside upstream bundles.

Mermaid's prebuilt bundle embeds DOMPurify 3.4.0, while the installed dependency
graph now resolves DOMPurify 3.4.17. Updating the lockfile alone does not update
code inside that prebuilt bundle. Runtime upgrades require regenerating vendor
assets and checking both rendering engines, all diagram fixtures and exports.

## Development tools and audit

All seven direct dependencies are used. Their versions are pinned for reproducible
installs. The supported development Node versions are 22.13+ within Node 22, or
Node 24+, matching the packaging and DOM-test tools. Bun remains the browser-app
server and unit-test runner.

Compatible transitive updates are pinned with overrides:

- Undici 7.29.1 (used by jsdom).
- source-map-js 1.2.2 (used by jsdom's CSS tooling).
- DOMPurify 3.4.17 (installed dependency of Mermaid and optional jsPDF features).

`bun audit` changed from 14 findings (3 high, 5 moderate, 6 low) to one low finding:
[GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), affecting
KaTeX versions below 0.18.2 and requiring existing prototype pollution to bypass
trust restrictions. The installed KaTeX version is 0.16.47. No exploit in this
viewer has been demonstrated by the audit. This finding is not suppressed.

The fix crosses KaTeX's current dependency range, and an override would not repair
the existing Mermaid bundle. Handle it with a separately validated renderer
upgrade rather than changing layout/math rendering during this refactor.
An audit of installed packages is not proof that every embedded runtime component
is free of vulnerabilities.

Recheck with `bun audit` before each release. Do not use `bun update --latest`
without reviewing renderer compatibility and the generated asset diff.
