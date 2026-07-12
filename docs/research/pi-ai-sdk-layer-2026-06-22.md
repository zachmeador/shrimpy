# 🦐 Pi AI SDK Layer Breaking Change

Date: 2026-06-22
Updated: 2026-07-12
Status: Research

This note tracks the `@earendil-works/pi-ai` breaking change first observed on upstream `main`, released in `0.80.0`, and probed against Shrimpy with stable Pi `0.80.6`. It is upgrade background, not authorization to change Shrimpy's runtime before review.

## Sources Checked

- Local upstream clone `/Users/zachmeador/gits/pi-mono`, refreshed to `8479bd84743e8889f728acb21a62794102db0529`; stable tag `v0.80.6` is `2b3fda9921b5590f285165287bd442a25817f17b`.
- Stable `v0.80.6` `@earendil-works/pi-ai` README, changelog, package exports, declarations, source, and tests.
- Upstream source files checked directly: `packages/ai/src/index.ts`, `packages/ai/src/compat.ts`, `packages/ai/src/models.ts`, `packages/ai/src/providers/all.ts`, `packages/coding-agent/src/core/model-registry.ts`, `packages/coding-agent/src/core/auth-storage.ts`, `packages/coding-agent/src/core/agent-session.ts`, and coding-agent compaction and extension types.
- npm registry checks on 2026-07-12: all four Shrimpy-used Pi packages report `0.80.6` as `latest`.
- Shrimpy imports checked across `src`, `test`, `extensions`, docs, and package metadata, followed by a clean detached-worktree dependency/build/full-test probe.

## Short Answer

Pi split `pi-ai` into an explicit SDK surface in `0.80.0`. The root `@earendil-works/pi-ai` entrypoint is now core-only and side-effect free. Consumers build a `Models` collection, register provider factories, and call `models.stream()` or `models.complete()` instead of relying on global provider registration and global helper functions.

The old global API remains at `@earendil-works/pi-ai/compat`, described as temporary. Pi coding-agent `0.80.6` still uses that entrypoint for its own compaction and model runtime, so Shrimpy cannot cleanly share coding-agent's new `Models` collection yet. The Shrimpy probe used `/compat` only as a disposable compile/test bridge; adopting it in the main checkout requires an explicit policy decision because Shrimpy normally rejects legacy compatibility paths.

## Version State

- Shrimpy currently pins `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at `0.79.6`.
- npm `latest` for all four packages is `0.80.6` as of 2026-07-12.
- Stable `0.80.6` exports `./compat`, `./providers/*`, and `./api/*`; the old `./base` entrypoint is removed.
- Stable `pi-coding-agent@0.80.6` still imports `@earendil-works/pi-ai/compat` in its session, model registry, auth, and compaction implementation. Its extension context exposes `ModelRegistry` and resolved request auth, not the underlying new `Models` collection.
- A clean Shrimpy `0.80.6` probe fails before source changes at the removed root imports and the expanded settings selector contract. After the documented probe-only changes, `npm run build` and all 570 tests pass.

## What Changed

- The old root global API moved behind `@earendil-works/pi-ai/compat`: `stream`, `complete`, `streamSimple`, `completeSimple`, `getModel`, `getModels`, `getProviders`, API provider registry helpers, environment-key helpers, direct lazy stream wrappers, and image-generation globals.
- The new runtime object is `Models`. `createModels()` returns an isolated provider collection with sync catalog reads, explicit async refresh, auth inspection, and stream/complete methods that resolve auth through the owning provider.
- Provider factories live under `@earendil-works/pi-ai/providers/*`. `@earendil-works/pi-ai/providers/all` exposes `builtinModels()`, `builtinProviders()`, and static catalog reads such as `getBuiltinModel()`, `getBuiltinModels()`, and `getBuiltinProviders()`.
- API implementation modules live under `@earendil-works/pi-ai/api/*`, named by API id. They export raw `stream` and `streamSimple` functions for callers that deliberately target one API.
- Auth is provider-owned through injectable `CredentialStore` and `AuthContext` abstractions.
- The old provider-id type `Provider` became `ProviderId`; `Provider` now means the runtime provider interface.

## Shrimpy Direct Impact

Most Shrimpy runtime calls still go through `@earendil-works/pi-coding-agent` (`ModelRegistry`, `AuthStorage`, `createAgentSession`, session runtime, TUI, extensions). Shrimpy should bump the four Pi packages together.

| File | Current direct use | Released migration |
| --- | --- | --- |
| `src/sessions/compaction-runner.ts` | Imports `completeSimple` from the root and passes explicit `apiKey` and `headers` for custom compaction summaries. The `0.80.6` build fails with `TS2305`. | Probe path: import `completeSimple` from `@earendil-works/pi-ai/compat`, matching Pi coding-agent's own `0.80.6` compaction. Long-term path: inject the active Pi `Models` completion function once coding-agent exposes it. Do not invent a second auth/model runtime in Shrimpy. |
| `src/setup/model-access.ts` | Imports `getProviders()` from the root to distinguish built-in API-key providers from custom providers and OAuth providers. The build fails with `TS2724`, followed by a `Set<unknown>` inference error. | Use `getBuiltinProviders()` from `@earendil-works/pi-ai/providers/all`. The disposable probe and setup tests pass with this direct migration. |
| `test/thinking.test.ts` | Imports `streamSimple` from the root to capture a local Qwen OpenAI-compatible request payload. Runtime test loading fails because the export is absent. | Import `streamSimple` from `@earendil-works/pi-ai/api/openai-completions`; this test is intentionally API-specific and does not need `/compat`. |
| Type-only imports across `src` and `test` | `Api`, `Model`, `Context`, content block types, and option/result types. | The root still exports the relevant core types. No probe change was required. |
| `src/tui/shrimpy-model-selection.ts` | Imports `modelsAreEqual` plus `Api` and `Model` types. | `modelsAreEqual` remains on the root. No probe change was required. |

## Migration Bias

For `0.80.6`, migrate direct call sites where the new API is clear: use `getBuiltinProviders()` for setup catalog reads and the raw `api/openai-completions` stream in the focused Qwen test. The custom compaction seam is different: coding-agent still owns auth through `ModelRegistry` and internally dispatches through `/compat`, while it does not expose its new `Models` collection to extensions. A Shrimpy-owned parallel `Models` collection would duplicate Pi's auth/model boundary and is the wrong abstraction.

That leaves an explicit review choice: allow one temporary `/compat` import in `src/sessions/compaction-runner.ts`, matching upstream coding-agent, or defer the package bump until coding-agent exposes a non-compat completion boundary. If the temporary bridge is approved, keep it isolated and tracked for removal; do not spread `/compat` across other Shrimpy code.

The bundle-size motivation matters more for browser bundles than for Shrimpy's current Node CLI/TUI process. Do not let selective providers drive a broad Shrimpy refactor without a concrete runtime need.

## Probe Results And Implementation Checks

- Registry, changelog, exports, declarations, source diffs, and the stable tag were rechecked on 2026-07-12.
- A disposable worktree from Shrimpy clean `HEAD` was bumped to all four `0.80.6` packages. The unmodified build exposed the expected root-export and settings-selector failures.
- Probe-only changes moved the setup catalog and Qwen test to direct new APIs, used `/compat` only for custom compaction, carried the new settings contract, and added `max` to Shrimpy's thinking validation and bundled extension.
- `npm run build` passed after those changes.
- The affected 50-test slice passed, including compaction, setup/model access, thinking, TUI settings/theme/command/model selection, context rendering, and tool rendering.
- `npm test` passed 570/570 after the disposable worktree path was made to end in `/shrimpy` for existing path-sensitive tests.
- Implementation should add assertions for `max`, the new Pi settings fields/callbacks, and automatic light/dark theme selection; the probe proved compatibility but did not manually drive the interactive automatic-theme submenu.

## Current Recommendation

Pi `0.80.6` is upgradeable with a small, known patch and high automated confidence, but Shrimpy should remain pinned pending review. The only architectural decision is the custom compaction bridge: approve one temporary `/compat` import or defer until Pi exposes its `Models` runtime at the coding-agent/extension boundary. A deeper Shrimpy-side SDK migration should wait for that supported integration point.
