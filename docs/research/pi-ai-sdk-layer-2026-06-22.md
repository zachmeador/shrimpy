# 🦐 Pi AI SDK Layer Breaking Change

Date: 2026-06-22
Status: Research

This note tracks the upcoming `@earendil-works/pi-ai` breaking release reported in the maintainer tweet quoted by the user and verified against upstream Pi `main`. It is background for a future Pi package bump, not an instruction to change Shrimpy's runtime today.

## Sources Checked

- Upstream `@earendil-works/pi-ai` README on `main`: [packages/ai/README.md](https://github.com/earendil-works/pi/tree/main/packages/ai#quick-start)
- Upstream `@earendil-works/pi-ai` changelog on `main`: [packages/ai/CHANGELOG.md](https://github.com/earendil-works/pi/blob/main/packages/ai/CHANGELOG.md)
- Upstream `@earendil-works/pi-ai` package exports on `main`: [packages/ai/package.json](https://github.com/earendil-works/pi/blob/main/packages/ai/package.json)
- Upstream source files checked directly: `packages/ai/src/index.ts`, `packages/ai/src/compat.ts`, `packages/ai/src/models.ts`, `packages/ai/src/providers/all.ts`, `packages/coding-agent/src/core/model-registry.ts`, `packages/coding-agent/src/core/auth-storage.ts`, `packages/coding-agent/src/core/agent-session.ts`
- npm registry checks on 2026-06-22: `@earendil-works/pi-ai@0.79.10` and `@earendil-works/pi-coding-agent@0.79.10`
- Shrimpy source imports checked with `rg` against `src`, `test`, `docs`, and `package.json`

## Short Answer

Pi is splitting `pi-ai` into an explicit SDK surface. The root `@earendil-works/pi-ai` entrypoint on upstream `main` is now core-only and side-effect free. Consumers build a `Models` collection, register provider factories, and call `models.stream()` / `models.complete()` instead of relying on global provider registration and global helper functions.

The old global API is not gone immediately. Upstream moved it to `@earendil-works/pi-ai/compat`, described as a temporary strict superset of the old root. A mechanical import-path change should keep old code working while a real migration moves to `createModels()` and provider factories.

## Version State

- Shrimpy currently pins `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at `0.79.6`.
- npm `latest` for `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` was `0.79.10` on 2026-06-22.
- The current npm `0.79.10` `pi-ai` package has a `./base` export and direct provider subpaths, but it does not have `./compat`.
- Upstream GitHub `main` still reports package version `0.79.10`, but its `CHANGELOG.md` has an `Unreleased` breaking section and its package exports include `./compat`, `./providers/*`, and `./api/*`. Treat the breaking API as landed on `main` but not yet released as npm `latest`.
- Upstream `pi-coding-agent` on `main` still imports `@earendil-works/pi-ai/compat` in `model-registry.ts`, `auth-storage.ts`, and `agent-session.ts`. That matches the tweet's note that coding-agent and new harness integration remain unfinished.

## What Changed

- The old root global API moves behind `@earendil-works/pi-ai/compat`: `stream`, `complete`, `streamSimple`, `completeSimple`, `getModel`, `getModels`, `getProviders`, API provider registry helpers, env-key helpers, direct lazy stream wrappers, and image-generation globals.
- The new runtime object is `Models`. `createModels()` returns an isolated provider collection with sync reads (`getModel`, `getModels`, `getProviders`), explicit async `refresh()`, auth inspection (`getAuth()`), and stream/complete methods that resolve auth through the owning provider.
- Provider factories live under `@earendil-works/pi-ai/providers/*`. `@earendil-works/pi-ai/providers/all` exposes `builtinModels()`, `builtinProviders()`, and static catalog reads such as `getBuiltinModel()` / `getBuiltinModels()` / `getBuiltinProviders()`.
- Provider SDKs are still lazy-loaded on first request. The bundle-size win comes from importing only selected provider factories and catalogs instead of importing all generated provider metadata through the old root.
- Auth is provider-owned. `CredentialStore` is injectable, `AuthContext` is injectable, and stored credentials own their provider; environment variables are fallback only when nothing is stored.
- API implementation modules move from provider-named modules to API-id modules under `@earendil-works/pi-ai/api/*`. For example, Anthropic is now `api/anthropic-messages`, Google is `api/google-generative-ai`, and Mistral is `api/mistral-conversations`.
- The type name `Provider` changes meaning: upstream renamed the old provider-id type to `ProviderId`, and `Provider` now means the runtime provider interface.

## Shrimpy Direct Impact

Most Shrimpy runtime calls go through `@earendil-works/pi-coding-agent` (`ModelRegistry`, `AuthStorage`, `createAgentSession`, session runtime, TUI, extensions). That may shield Shrimpy from part of the `pi-ai` break if Pi lands a coherent coding-agent migration before the next package release. Shrimpy should still bump the Pi packages together, not `pi-ai` alone.

Direct `pi-ai` imports in this checkout are smaller:

| File | Current direct use | Likely migration |
| --- | --- | --- |
| `src/sessions/compaction-runner.ts` | Imports `completeSimple` from the root and passes explicit `apiKey` / `headers` for Shrimpy's custom compaction summaries. | Temporary path: import `completeSimple` from `@earendil-works/pi-ai/compat`. Better path: inject or construct the same provider/auth collection used by the active Pi session once coding-agent exposes the new model path. |
| `src/setup/model-access.ts` | Imports `getProviders()` from the root to distinguish built-in API-key providers from custom providers and OAuth providers. | Use `getBuiltinProviders()` from `@earendil-works/pi-ai/providers/all`, or avoid a static Pi catalog read by deriving setup choices from `ModelRegistry` plus Pi's display-name map if upstream changes that boundary. |
| `test/thinking.test.ts` | Imports `streamSimple` from the root to capture a local Qwen OpenAI-compatible request payload. | Temporary path: import `streamSimple` from `/compat`. Better path: use a focused provider/API import once the new `api/openai-completions` surface is released and stable. |
| Type-only imports across `src` and `test` | `Api`, `Model`, `Context`, content block types, option/result types. | Root core still exports the stable type layer on upstream `main`; these are not the main risk. Watch for the `Provider` -> `ProviderId` rename if Shrimpy ever imports that type directly. |
| `src/tui/shrimpy-model-selection.ts` | Imports `modelsAreEqual` plus `Api` / `Model` types. | `modelsAreEqual` remains exported from upstream `models.ts` through the new root in the checked source, so this is probably unchanged. |

## Migration Bias

For the first bump after the breaking release, prefer a small compatibility pass over a speculative rewrite. If the released coding-agent still exposes the same `ModelRegistry` and `AuthStorage` shape, Shrimpy can likely switch the few direct old-global imports to `/compat`, build, and then evaluate a proper `Models` migration separately.

The long-term direction is still worth tracking: Shrimpy already stores Pi auth/model state under workspace `state/pi/`, and the new `CredentialStore` / `AuthContext` shape is a cleaner conceptual match than global environment resolution. But Shrimpy should not invent its own parallel model/auth collection until Pi's coding-agent migration lands and shows the supported integration point.

The bundle-size motivation matters more for browser/web surfaces than for the current Node CLI/TUI process. Do not let "selective providers" drive a Shrimpy refactor unless a Shrimpy web/runtime bundle actually imports `pi-ai` directly.

## Checks To Run When The Release Lands

- Re-check npm `latest`, upstream `CHANGELOG.md`, and package `exports`; do not assume GitHub `main` exactly matches the published release.
- Re-run `rg -n "from ['\\\"]@earendil-works/pi-ai|@earendil-works/pi-ai"` across `src`, `test`, `extensions`, and docs.
- In a disposable branch/worktree, bump all four Pi packages together and run `npm run build` plus targeted tests for model setup, compaction, sessions, TUI model selection/settings, and `test/thinking.test.ts`.
- Inspect released `pi-coding-agent` imports and exports for `ModelRegistry`, `AuthStorage`, OAuth login, custom provider/model config, and session auth resolution before changing Shrimpy's setup flow.
- Re-verify Qwen/chat-template thinking behavior. Upstream `0.79.9` already added configurable `chat-template` thinking support for OpenAI-compatible providers, and Shrimpy's local thinking test is sensitive to the exact request payload.

## Current Recommendation

Do not change code for this yet. Add this as a known upgrade watchpoint, keep Shrimpy pinned until the breaking Pi release and migration guide are published, then evaluate the smallest compatible bump first. A deeper Shrimpy-side SDK migration should wait for the released coding-agent integration rather than guessing against an unfinished upstream transition.
