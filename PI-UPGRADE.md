# Pi Upgrade Plan

Date: 2026-07-12
Shrimpy checkout: `/Users/zachmeador/gits/shrimpy` at `aa996bf8d188c90af56050472aad1c5bc46baf11`
Pi clone: `/Users/zachmeador/gits/pi-mono` at `8479bd84743e8889f728acb21a62794102db0529`; latest stable tag inspected: `v0.80.6` at `2b3fda9921b5590f285165287bd442a25817f17b`

## Summary

Pi `0.80.6` is upgradeable with a small, known Shrimpy patch and high automated confidence. A disposable clean-`HEAD` probe builds and passes all 570 tests after migrating two direct `pi-ai` call sites, bridging custom compaction through Pi's temporary `/compat` entrypoint, carrying Pi's expanded settings selector contract, and adding the new `max` thinking level.

Do not apply the upgrade until review. One decision is intentionally unresolved: Shrimpy's legacy policy normally forbids compatibility paths, but Pi coding-agent `0.80.6` still uses `@earendil-works/pi-ai/compat` internally and does not expose its new `Models` collection to extensions. The practical options are to approve one isolated temporary `/compat` import for Shrimpy's custom compaction runner or defer the package bump until Pi exposes a non-compat completion boundary. Building a parallel Shrimpy auth/model runtime is not recommended.

The main Shrimpy working tree was dirty before this assessment with unrelated backlog deletions and edits under `docs/backlog/`. The disposable probe was created from clean `HEAD`; those uncommitted changes were not copied into it and were not part of the build or test results.

## Versions

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core@0.79.6`, `@earendil-works/pi-ai@0.79.6`, `@earendil-works/pi-coding-agent@0.79.6`, and `@earendil-works/pi-tui@0.79.6` in `package.json` and `package-lock.json`.
- Latest stable Pi version inspected: `v0.80.6`; all four package manifests and npm `latest` report `0.80.6`.
- Pi clone `main` is clean and fast-forwarded to `8479bd84743e8889f728acb21a62794102db0529`, 15 commits beyond `v0.80.6`. This plan targets the stable tag and published packages, not unreleased `main`.
- Node requirement remains `>=22.19.0` for the four Pi packages.

## Likely Breakage

- `src/sessions/compaction-runner.ts`: `completeSimple` is no longer exported from the `@earendil-works/pi-ai` root. The unmodified probe fails with `TS2305`. Pi's own coding-agent compaction imports it from temporary `/compat` in `0.80.6`.
- `src/setup/model-access.ts`: `getProviders` is no longer exported from the root. The unmodified probe fails with `TS2724`, then `Set<unknown>` propagates into `isApiKeyLoginProvider()`. The released replacement for this static catalog read is `getBuiltinProviders()` from `@earendil-works/pi-ai/providers/all`.
- `test/thinking.test.ts`: `streamSimple` is absent from the root at runtime. The targeted test process fails during module loading. Because this test specifically exercises OpenAI-compatible chat-completions payloads, the direct replacement is `@earendil-works/pi-ai/api/openai-completions`.
- `src/tui/shrimpy-settings.ts`: Pi's `SettingsConfig` now requires `terminalTheme`, `showCacheMissNotices`, and `outputPad`; `SettingsCallbacks` requires `onShowCacheMissNoticesChange` and `onOutputPadChange`. The unmodified probe fails with `TS2739` for both objects.
- `src/tui/shrimpy-settings.ts` and `src/tui/interactive.ts`: Pi's theme setting now supports automatic light/dark pairs. Shrimpy currently reads the resolved theme with `getTheme()` and applies values with `setTheme()`, while Pi `0.80.6` uses `getThemeSetting()` plus `themeController`. A compile-only bridge is insufficient for automatic theme selections such as `light-theme/dark-theme`; the production patch must carry Pi's controller behavior through Shrimpy's unified selector and startup priming.
- `src/sessions/thinking.ts` and `extensions/thinking.ts`: Pi `0.80.6` adds an opt-in `max` thinking level. Without adding it to both Shrimpy-owned lists, CLI/channel/config validation and the bundled `/thinking` command reject a Pi-native value.
- `src/app/pi-internals.ts`: Shrimpy's four deep imports into Pi's generated `dist/` tree still exist and compile at `0.80.6`, including HTTP dispatcher, provider display names, thinking selector, and theme helpers. Those paths changed internally across the diff and remain a high-risk private boundary even though this upgrade does not break them.

## Required Shrimpy Changes

- Update all four exact package pins and the lockfile from `0.79.6` to `0.80.6` together.
- Decide the compaction boundary before implementation. If the temporary exception is approved, change only `src/sessions/compaction-runner.ts` to import `completeSimple` from `@earendil-works/pi-ai/compat` and record that debt for removal when coding-agent exposes its `Models` completion path. If it is not approved, defer the upgrade rather than creating a second Shrimpy auth/model collection.
- In `src/setup/model-access.ts`, replace root `getProviders()` with `getBuiltinProviders()` from `@earendil-works/pi-ai/providers/all`.
- In `test/thinking.test.ts`, import `streamSimple` from `@earendil-works/pi-ai/api/openai-completions`.
- In `src/sessions/thinking.ts` and `extensions/thinking.ts`, add `max` after `xhigh`; update `test/thinking.test.ts` and `test/thinking-extension.test.ts` expectations to cover it.
- In `src/tui/shrimpy-settings.ts`, populate `terminalTheme`, `showCacheMissNotices`, and `outputPad`; add both required callbacks; use `getThemeSetting()` for the selector's persisted value; and mirror Pi's live component/rebuild behavior when output padding or cache-miss visibility changes.
- In `src/tui/shrimpy-settings.ts` and `src/tui/interactive.ts`, route theme setting, preview, terminal-theme detection, and startup resolution through Pi's `themeController` behavior so automatic light/dark pairs work. Add a focused test that exercises an automatic pair, not only a fixed `shrimpy` theme.
- Extend `test/tui-settings.test.ts` to assert the new Pi settings fields/callbacks and run the existing compaction, setup/model, thinking, TUI command/model/rendering, and theme tests.

## Verification

- `git fetch --tags --prune origin` and `git pull --ff-only origin main` in `/Users/zachmeador/gits/pi-mono`: passed; clone advanced from `12bb8dd2` to `8479bd84` without rewriting history.
- Stable selection: `v0.80.6` is the highest non-prerelease semver tag; npm registry checks returned `0.80.6` for all four packages.
- `npm install --save-exact @earendil-works/pi-agent-core@0.80.6 @earendil-works/pi-ai@0.80.6 @earendil-works/pi-coding-agent@0.80.6 @earendil-works/pi-tui@0.80.6` in a detached disposable worktree: passed. npm reported four audit findings in the resulting dependency graph and engine warnings because the probe shell uses Node `v23.6.0`, which is outside the current ESLint package's declared range.
- `npm run build` before probe-only source changes: failed with the removed `completeSimple` and `getProviders` exports plus missing Pi settings fields/callbacks.
- `npm run build` after the probe-only migration patch: passed.
- Affected slice after the completed probe patch: passed 50/50 tests covering `test/compaction-runner.test.ts`, `test/setup-command.test.ts`, `test/thinking*.test.ts`, and the relevant TUI settings/theme/command/model/context/tool-rendering tests.
- `npm test` after the completed probe patch, from a disposable path ending in `/shrimpy`: passed 570/570 tests across 98 suites.
- No live Shrimpy workspace files, main-checkout dependencies, generated `dist/`, source, tests, or lockfiles were changed by the probe.

## Upgrade Steps

1. Review and approve either the isolated temporary custom-compaction `/compat` exception or a decision to defer.
2. Preserve or commit the existing unrelated backlog work, then implement on a clean branch or deliberate `wip` state.
3. Install all four Pi packages at exact `0.80.6` together.
4. Apply the direct `getBuiltinProviders()` and raw `api/openai-completions` migrations.
5. Add `max` across Shrimpy validation, the bundled thinking extension, and tests.
6. Update the unified Pi settings bridge, including automatic theme controller behavior, cache-miss notices, and output padding.
7. Run `npm run build`, the affected 50-test slice, and `npm test` under a supported Node version.
8. Manually smoke a safe `shrimpy chat` session for fixed and automatic themes, `/settings`, `/thinking max`, model setup/selection, compaction, tool rendering, and session resume. Do not reset or migrate workspace state.
9. Inspect the final lockfile/audit delta, update changelog/reference docs as appropriate, and only then land the upgrade.

## Risks And Unknowns

- The temporary `/compat` compaction import is the only policy conflict. It matches upstream coding-agent `0.80.6`, but Pi documents the entrypoint as temporary and Shrimpy's default legacy policy forbids adding such paths without explicit approval.
- Automatic theme pairs were identified from released source and declarations but were not manually driven in the terminal during the probe. The production implementation needs a focused behavioral test and TUI smoke check.
- The probe ran under Node `v23.6.0`; implementation verification should use Shrimpy's supported Node `22.19.x` or a supported `24.x` runtime to avoid unrelated engine warnings.
- npm reported four dependency audit findings after the candidate install. They were not investigated or auto-fixed because that would expand the upgrade scope and mutate unrelated dependency versions.
- Deep `src/app/pi-internals.ts` imports remain outside Pi's public export contract. They survived `0.80.6`, but future upgrades can break them without a public semver signal.
- The clean-`HEAD` probe excludes the current uncommitted backlog edits. Their paths do not overlap the proposed implementation, but the real upgrade should begin from an intentional git state.
