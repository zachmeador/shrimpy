# Pi Upgrade Plan

Date: 2026-06-17
Shrimpy checkout: `/Users/zachmeador/gits/shrimpy` at `daf5db5b10baf1b455933cb5944361ebf9b528b7`
Pi clone: `/Users/zachmeador/gits/pi-mono` at `12bb8dd2c965d2088f08d27a19a049c54de53ead`; latest stable tag inspected: `v0.79.6` at `31bfb2f16f7a1dd707876e970f0f80caa61f8435`

## Summary

Upgrade Shrimpy from Pi `0.77.0` to `0.79.6` after one small Shrimpy TUI settings bridge change. The initial probe fails to compile because Pi `0.79.x` added project-trust settings fields to `SettingsConfig` and `SettingsCallbacks`. After wiring those fields in the disposable probe only, `npm run build` passes and the targeted Pi/TUI/session tests pass. Confidence is good for a narrow upgrade, with normal release verification still needed in the real checkout.

The main Shrimpy working tree was dirty before this assessment: `CHANGELOG.md`, `README.md`, `docs/reference/setup.md`, and `package-lock.json` had uncommitted changes. The disposable probe was created from clean `HEAD`, so those local edits were not part of the build or test results.

## Versions

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core@0.77.0`, `@earendil-works/pi-ai@0.77.0`, `@earendil-works/pi-coding-agent@0.77.0`, `@earendil-works/pi-tui@0.77.0` in `package.json` and `package-lock.json`.
- Latest stable Pi version inspected: `v0.79.6`, with all four package manifests at `0.79.6`.
- Pi `main` was one commit beyond `v0.79.6` for the next cycle; this plan targets the stable tag, not `main`.

## Likely Breakage

- `src/tui/shrimpy-settings.ts`: Pi `SettingsSelectorComponent` now requires `SettingsConfig.defaultProjectTrust` and `SettingsCallbacks.onDefaultProjectTrustChange`. The unmodified upgrade probe fails `tsc` with `TS2741` at `src/tui/shrimpy-settings.ts(342,3)` and `src/tui/shrimpy-settings.ts(377,3)`.
- `src/tui/shrimpy-settings.ts`: Shrimpy's unified Pi settings submenu should call `mode.settingsManager.getDefaultProjectTrust()` and `mode.settingsManager.setDefaultProjectTrust(defaultProjectTrust)` so Pi's new project-trust setting stays visible and editable when Shrimpy replaces Pi's default settings selector.
- `src/app/pi-internals.ts`: Shrimpy still uses direct relative imports into Pi's built output for `configureHttpDispatcher`, provider display names, thinking selector, and theme helpers. The temp build after the settings bridge fix proves those paths still exist in `0.79.6`, but this remains the highest-risk import style for future Pi upgrades.
- `@earendil-works/pi-ai` `0.78.0` changed direct provider stream functions to require explicit `options.apiKey`. Shrimpy currently uses top-level types/helpers such as `Api`, `Model`, `streamSimple`, and `modelsAreEqual`; no Shrimpy source change was required in the probe.
- Pi `0.79.0` introduced project trust gating for project-local Pi settings/resources/packages. The build/test probe did not show Shrimpy session startup regressions, but manual TUI smoke testing should confirm Shrimpy's own prompt/resource assembly still behaves as intended when Pi project trust defaults are `ask`, `always`, and `never`.

## Required Shrimpy Changes

- Update `package.json` and `package-lock.json` to `@earendil-works/pi-agent-core@0.79.6`, `@earendil-works/pi-ai@0.79.6`, `@earendil-works/pi-coding-agent@0.79.6`, and `@earendil-works/pi-tui@0.79.6`.
- Update `src/tui/shrimpy-settings.ts` in `buildPiSettingsConfig()` to include `defaultProjectTrust: mode.settingsManager.getDefaultProjectTrust()`.
- Update `src/tui/shrimpy-settings.ts` in `buildPiSettingsCallbacks()` to include `onDefaultProjectTrustChange: (defaultProjectTrust) => { mode.settingsManager.setDefaultProjectTrust(defaultProjectTrust); }`.
- Consider adding or extending `test/tui-settings.test.ts` to assert that Shrimpy's unified settings bridge includes Pi's project-trust setting when building against Pi `0.79.6`.

## Verification

- `git clone https://github.com/badlogic/pi-mono /Users/zachmeador/gits/pi-mono`: initially completed before interruption, then the remote was corrected to the current canonical `https://github.com/earendil-works/pi`.
- `git fetch --tags --prune origin` in `/Users/zachmeador/gits/pi-mono`: passed.
- `npm install --ignore-scripts @earendil-works/pi-agent-core@0.79.6 @earendil-works/pi-ai@0.79.6 @earendil-works/pi-coding-agent@0.79.6 @earendil-works/pi-tui@0.79.6` in `/private/tmp/shrimpy-pi-upgrade-probe-20260617-1`: passed after rerunning with network access; npm warned that this shell used Node `v23.6.0` while some dev packages declare support for `^20.19.0 || ^22.13.0 || >=24`.
- `npm run build` in the disposable probe before the settings bridge fix: failed with missing `defaultProjectTrust` and `onDefaultProjectTrustChange`.
- `npm run build` in the disposable probe after the temp-only settings bridge fix: passed.
- `node --test --experimental-strip-types test/tui-settings.test.ts test/sessions.test.ts test/session-planner.test.ts test/thinking.test.ts test/compact-tools-extension.test.ts test/model-switch-renderer-extension.test.ts test/tui-command-surface.test.ts test/tui-model-selection.test.ts test/tui-context-rendering.test.ts test/tui-tool-rendering.test.ts test/tui-theme.test.ts test/session-tool-policy.test.ts` in the disposable probe after the temp-only fix: passed, 63 tests.
- `npm test` in the disposable probe after the temp-only fix: failed 4 of 564 tests. The failures were not Pi API failures: two `watchChannels` tests hit `EMFILE: too many open files, watch`, and two tests assumed the source checkout path ended in `/shrimpy`, which was false for `/private/tmp/shrimpy-pi-upgrade-probe-20260617-1`.

## Upgrade Steps

1. Start from a Shrimpy branch or clean `wip`/`main` state, preserving the existing uncommitted local edits intentionally.
2. Run `npm install --ignore-scripts @earendil-works/pi-agent-core@0.79.6 @earendil-works/pi-ai@0.79.6 @earendil-works/pi-coding-agent@0.79.6 @earendil-works/pi-tui@0.79.6`.
3. Wire `defaultProjectTrust` through `src/tui/shrimpy-settings.ts` as described above.
4. Add a focused test for the project-trust settings bridge if practical.
5. Run `npm run build`.
6. Run the targeted Pi/TUI/session tests listed in Verification.
7. Run `npm test` from the real Shrimpy checkout path so path-sensitive tests use `/Users/zachmeador/gits/shrimpy`; if `EMFILE` recurs, rerun `test/channels.test.ts` separately or raise the file-watch limit before treating it as an upgrade regression.
8. Manually smoke `shrimpy chat` or the closest safe TUI startup path with Shrimpy's repo-local workspace to verify project trust, model selection, settings, prompt context, and tool rendering still behave correctly.

## Risks And Unknowns

- The probe used Node `v23.6.0`, which triggers npm engine warnings for the current ESLint stack. Release verification should use the supported local Node version for Shrimpy/Pi, preferably Node `22.19.x` or a supported `24.x`.
- Pi project trust is a new user-visible policy surface. Shrimpy already owns most workspace prompt/resource assembly, but TUI settings still expose Pi runtime settings; the implementation should decide whether Shrimpy wants to document or constrain Pi's project-trust default.
- The deep relative imports in `src/app/pi-internals.ts` still work in `0.79.6`, but they are not protected by Pi's public package exports. Future Pi upgrades may break those without a semver-visible package export change.
- The full-suite probe was run from a disposable archive copy rather than a real git worktree because sandbox permissions prevented `git worktree add` from writing `.git/worktrees`. Path-sensitive failures should be rechecked in the real checkout after implementation.
