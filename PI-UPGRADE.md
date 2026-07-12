# Pi Upgrade Plan

Date: 2026-07-12
Shrimpy checkout: `/Users/zachmeador/gits/shrimpy` at implementation base `8564e07ebdb8662e1f303956f3814d9523269bcf`
Pi clone: `/Users/zachmeador/gits/pi-mono` at `8479bd84743e8889f728acb21a62794102db0529`; latest stable tag inspected: `v0.80.6` at `2b3fda9921b5590f285165287bd442a25817f17b`

## Summary

Shrimpy is upgraded to Pi `0.80.6` with the user-approved isolated custom-compaction `/compat` bridge. The main checkout builds, the affected migration slice passes 58/58 tests, and the full suite passes 571/571 tests after migrating direct `pi-ai` call sites, carrying Pi's expanded settings selector contract, supporting automatic theme pairs, and adding the new `max` thinking level.

The user explicitly approved the one compatibility exception. Pi coding-agent `0.80.6` still uses `@earendil-works/pi-ai/compat` internally and does not expose its new `Models` collection to extensions, so Shrimpy keeps that import confined to `src/sessions/compaction-runner.ts`. Building a parallel Shrimpy auth/model runtime remains intentionally out of scope.

The main Shrimpy working tree was dirty before this assessment with unrelated backlog deletions and edits under `docs/backlog/`. The disposable probe was created from clean `HEAD`; those uncommitted changes were not copied into it and were not part of the build or test results.

## Versions

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core@0.80.6`, `@earendil-works/pi-ai@0.80.6`, `@earendil-works/pi-coding-agent@0.80.6`, and `@earendil-works/pi-tui@0.80.6` in `package.json` and `package-lock.json`.
- Latest stable Pi version inspected: `v0.80.6`; all four package manifests and npm `latest` report `0.80.6`.
- Pi clone `main` is clean and fast-forwarded to `8479bd84743e8889f728acb21a62794102db0529`, 15 commits beyond `v0.80.6`. This plan targets the stable tag and published packages, not unreleased `main`.
- Node requirement remains `>=22.19.0` for the four Pi packages.

## Breakage Resolved

- `src/sessions/compaction-runner.ts`: `completeSimple` is no longer exported from the `@earendil-works/pi-ai` root. The unmodified probe fails with `TS2305`. Pi's own coding-agent compaction imports it from temporary `/compat` in `0.80.6`.
- `src/setup/model-access.ts`: `getProviders` is no longer exported from the root. The unmodified probe fails with `TS2724`, then `Set<unknown>` propagates into `isApiKeyLoginProvider()`. The released replacement for this static catalog read is `getBuiltinProviders()` from `@earendil-works/pi-ai/providers/all`.
- `test/thinking.test.ts`: `streamSimple` is absent from the root at runtime. The targeted test process fails during module loading. Because this test specifically exercises OpenAI-compatible chat-completions payloads, the direct replacement is `@earendil-works/pi-ai/api/openai-completions`.
- `src/tui/shrimpy-settings.ts`: Pi's `SettingsConfig` now requires `terminalTheme`, `showCacheMissNotices`, and `outputPad`; `SettingsCallbacks` requires `onShowCacheMissNoticesChange` and `onOutputPadChange`. The unmodified probe fails with `TS2739` for both objects.
- `src/tui/shrimpy-settings.ts` and `src/tui/interactive.ts`: Pi's theme setting now supports automatic light/dark pairs. Shrimpy currently reads the resolved theme with `getTheme()` and applies values with `setTheme()`, while Pi `0.80.6` uses `getThemeSetting()` plus `themeController`. A compile-only bridge is insufficient for automatic theme selections such as `light-theme/dark-theme`; the production patch must carry Pi's controller behavior through Shrimpy's unified selector and startup priming.
- `src/sessions/thinking.ts` and `extensions/thinking.ts`: Pi `0.80.6` adds an opt-in `max` thinking level. Without adding it to both Shrimpy-owned lists, CLI/channel/config validation and the bundled `/thinking` command reject a Pi-native value.
- `src/app/pi-internals.ts`: Shrimpy's four deep imports into Pi's generated `dist/` tree still exist and compile at `0.80.6`, including HTTP dispatcher, provider display names, thinking selector, and theme helpers. Those paths changed internally across the diff and remain a high-risk private boundary even though this upgrade does not break them.

## Implemented Shrimpy Changes

- Updated all four exact package pins and the lockfile from `0.79.6` to `0.80.6` together.
- Changed only `src/sessions/compaction-runner.ts` to import `completeSimple` from `@earendil-works/pi-ai/compat`, as explicitly approved, and kept the compatibility boundary isolated.
- Replaced root `getProviders()` with `getBuiltinProviders()` from `@earendil-works/pi-ai/providers/all` in `src/setup/model-access.ts`.
- Changed `test/thinking.test.ts` to import `streamSimple` from `@earendil-works/pi-ai/api/openai-completions`.
- Added `max` after `xhigh` in `src/sessions/thinking.ts` and `extensions/thinking.ts`, with test coverage.
- Updated `src/tui/shrimpy-settings.ts` for `terminalTheme`, `showCacheMissNotices`, `outputPad`, their callbacks, raw theme settings, automatic theme preview/application, and live output-padding updates.
- Updated `src/tui/interactive.ts` and `src/app/pi-internals.ts` to resolve automatic light/dark theme pairs during TUI priming, with focused coverage in `test/tui-theme.test.ts`.
- Added the user-visible Pi upgrade note under the active Unreleased section in `CHANGELOG.md`.

## Verification

- `git fetch --tags --prune origin` and `git pull --ff-only origin main` in `/Users/zachmeador/gits/pi-mono`: passed; clone advanced from `12bb8dd2` to `8479bd84` without rewriting history.
- Stable selection: `v0.80.6` is the highest non-prerelease semver tag; npm registry checks returned `0.80.6` for all four packages.
- `npm install --save-exact @earendil-works/pi-agent-core@0.80.6 @earendil-works/pi-ai@0.80.6 @earendil-works/pi-coding-agent@0.80.6 @earendil-works/pi-tui@0.80.6` in a detached disposable worktree: passed. npm reported four audit findings in the resulting dependency graph and engine warnings because the probe shell uses Node `v23.6.0`, which is outside the current ESLint package's declared range.
- `npm run build` before probe-only source changes: failed with the removed `completeSimple` and `getProviders` exports plus missing Pi settings fields/callbacks.
- `npm run build` after the probe-only migration patch: passed.
- Affected slice after the completed probe patch: passed 50/50 tests covering `test/compaction-runner.test.ts`, `test/setup-command.test.ts`, `test/thinking*.test.ts`, and the relevant TUI settings/theme/command/model/context/tool-rendering tests.
- `npm test` after the completed probe patch, from a disposable path ending in `/shrimpy`: passed 570/570 tests across 98 suites.
- `npm run build` in the main checkout after implementation: passed.
- Focused migration suite in the main checkout: passed 58/58 tests.
- `npm test` in the main checkout after implementation: passed 571/571 tests across 98 suites.
- `npm run lint`: passed with no errors and four unrelated pre-existing unused-import/variable warnings.
- No live Shrimpy workspace config or state files were changed.

## Upgrade Steps

1. Approved the isolated temporary custom-compaction `/compat` exception.
2. Installed all four Pi packages at exact `0.80.6` together while preserving unrelated backlog work.
3. Applied the direct `getBuiltinProviders()` and raw `api/openai-completions` migrations.
4. Added `max` across Shrimpy validation, the bundled thinking extension, and tests.
5. Updated the unified Pi settings bridge for automatic themes, cache-miss notices, and output padding.
6. Ran the build, focused migration tests, full suite, and lint successfully.
7. Remaining handoff: manually smoke a safe `shrimpy chat` session for fixed and automatic themes, `/settings`, `/thinking max`, model setup/selection, compaction, tool rendering, and session resume when convenient.

## Risks And Unknowns

- The temporary `/compat` compaction import is explicitly approved and matches upstream coding-agent `0.80.6`, but Pi documents the entrypoint as temporary. Remove it when coding-agent exposes its `Models` completion boundary.
- Automatic theme pairs have focused resolution coverage but were not manually driven in the terminal. A TUI smoke check remains useful.
- The probe ran under Node `v23.6.0`; implementation verification should use Shrimpy's supported Node `22.19.x` or a supported `24.x` runtime to avoid unrelated engine warnings.
- npm reported four dependency audit findings after the candidate install. They were not investigated or auto-fixed because that would expand the upgrade scope and mutate unrelated dependency versions.
- Deep `src/app/pi-internals.ts` imports remain outside Pi's public export contract. They survived `0.80.6`, but future upgrades can break them without a public semver signal.
- The clean-`HEAD` probe excludes the current uncommitted backlog edits. Their paths do not overlap the proposed implementation, but the real upgrade should begin from an intentional git state.
