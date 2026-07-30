# 🦐 Pi Coding Agent

Date: 2026-06-11
Updated: 2026-07-29
Status: `0.83.0` implemented; manual smoke test passed

Pi is Shrimpy's embedded agent and session engine. Shrimpy pins the registry-published `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` packages rather than depending on a local checkout or active fork.

This note describes the architectural boundary, the latest stable upgrade assessment, and how Shrimpy can use more of Pi's package ecosystem without becoming a Pi package itself.

## Architectural Position

Shrimpy should remain an application built on Pi's SDK. Pi owns the model/tool loop, provider dispatch, transcript mechanics, session tree, compaction primitives, extension runtime, and interactive terminal foundation. Shrimpy owns durable workspaces, agents, channels, surfaces, watches, workers, routing, policy, and long-lived services.

A Pi package has a session-level lifecycle and contributes extensions, skills, prompts, themes, or providers. Moving all of Shrimpy into that lifecycle would invert the ownership boundary and force durable home-agent services into an agent-session plugin. Pi packages should instead be optional capabilities hosted by Shrimpy.

## Current Shrimpy Integration

- Shrimpy pins all four Pi packages at `0.83.0`.
- Shrimpy requires Node `>=22.19.0`, matching Pi's runtime requirement.
- Pi-facing tool schemas use `typebox` `1.3.7`, aligned with Pi. Shrimpy-owned configuration schemas remain on `@sinclair/typebox` `0.34.41` because those types never cross the Pi tool boundary.
- The main host boundary uses `createAgentSession()`, `createAgentSessionRuntime()`, `SessionManager`, `SettingsManager`, and `DefaultResourceLoader`.
- `SessionBootstrap` constructs one canonical `ModelRuntime` with workspace-local auth, custom-model, and dynamic-catalog paths and passes it through session creation and replacement.
- Shrimpy extensions register tools, commands, headers, footers, custom UI, message renderers, lifecycle hooks, model-switch rendering, activity state, turn context, session leases, and compaction interception through public extension APIs.
- Resource-loader overrides let Shrimpy own prompt assembly and visible skill selection while Pi retains native tool definitions, provider calls, transcript mechanics, and the interactive runtime.
- Pi's session replacement lifecycle powers Shrimpy's cross-agent and cross-session navigator.
- Normal `npm test` does not typecheck `extensions/*.ts`; Pi upgrades need a separate extension typecheck.
- `ToolRenderContext` remains internal. Shrimpy compact-tool renderers use local structural typing rather than importing a private type.

Shrimpy deliberately creates Pi settings in memory and passes a fixed set of bundled extension and skill paths. This keeps sessions deterministic and prevents ambient Pi configuration from silently changing a home agent, but it also means Shrimpy cannot currently consume normal Pi packages.

## Latest Stable Pi

The latest stable tag inspected on 2026-07-29 is `v0.83.0` at `845d6ff1f6643aba440341cce877ce1c43ebbc39`. Shrimpy now pins that release after the dependency-only implementation described below.

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at exact `0.83.0`.
- Latest stable Pi version inspected: tag `v0.83.0`, commit `845d6ff1f6643aba440341cce877ce1c43ebbc39`.
- Pi `0.83.0` upgrades its public and bundled TypeBox dependency from `1.1.38` to `1.3.7`. Removed deprecated APIs are the release's only declared breaking surface; Shrimpy uses none of them.
- Provider/runtime additions include per-request `fetch`, partial-stream `stopReason: "pending"`, `AssistantMessage.rawStopReason`, automatic OAuth refresh with minimum-validity control, headless OpenRouter login, and Claude Opus 5 through GitHub Copilot.
- Coding-agent fixes directly relevant to Shrimpy include settling an active response before session replacement, avoiding duplicate startup messages during extension-driven session switches, preserving resource provenance after reload, exposing `ctx.scopedModels`, and fixing nested-worktree context duplication.
- TUI fixes improve image fallback paths and model-selector filtering. Pi's changed interactive internals did not break Shrimpy's five named compatibility seams in the disposable probe.

Pi's upstream `main` was one post-release `[Unreleased]` bookkeeping commit beyond `v0.83.0` during the assessment, at `71efc6f0c1909874ec8c944637a9ae7fc0e2d508`. The upgrade target is the stable tag and published packages, not unreleased branch state.

## `0.83.0` Upgrade Assessment

Shrimpy checkout: `/Users/zachmeador/gits/shrimpy`, clean `main` at `b70b8b69f6f5d38b23e6eef0bfbe6e5670bc7bb1`

Pi clone: `/Users/zachmeador/gits/pi-mono`; stable tag `v0.83.0` at `845d6ff1f6643aba440341cce877ce1c43ebbc39`; inspected `main` at `71efc6f0c1909874ec8c944637a9ae7fc0e2d508`

### Summary

The dependency-only upgrade is implemented and ready for manual smoke testing. Confidence is high: the unchanged Shrimpy source builds against all four `0.83.0` packages, the extension typecheck and lint pass, the 216-test focused Pi integration slice passes, and the complete 708-test suite passes. Shrimpy's direct Pi-facing `typebox` dependency is aligned to `1.3.7` so tool schemas and Pi's validator share one version.

### Versions

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at exact `0.83.0`.
- Latest stable Pi version inspected: tag `v0.83.0`, commit `845d6ff1f6643aba440341cce877ce1c43ebbc39`.
- Current Shrimpy Pi-facing TypeBox package: `typebox` at exact `1.3.7`.

### Likely Breakage

- No Shrimpy source breakage was found. The unchanged source and generated web/CLI builds pass against `0.83.0`.
- Pi removed deprecated TypeBox APIs including `Type.Base`, `Type.Awaited`, `Type.Promise`, `Type.AsyncIterator`, `Type.Iterator`, `Type.Options`, and `Value.Mutate`. Searches across `src/` and `test/` found no Shrimpy use of those APIs.
- `src/tools/daemon.ts` creates schemas with Shrimpy's direct `typebox` dependency and hands them to Pi's `ToolDefinition` and runtime validator. A split-version probe with Shrimpy on `1.1.38` and Pi on `1.3.7` built and validated representative valid and invalid calls correctly, but aligning the direct pin to `1.3.7` removes duplicate compiler copies and is the safer long-term boundary.
- Pi now awaits `session.abort()` before session replacement and aborts active tree navigation responses. This changes timing around Shrimpy's `src/tui/session-target.ts` and `src/tui/session-navigator.ts`, but the focused replacement, navigator, runtime-lease, and archive tests pass unchanged.
- Pi changed resource reload provenance, nested-worktree context discovery, extension contexts, interactive rebinding, model-selector filtering, tool-expansion status, and image fallback rendering. Shrimpy's resource override, session prompt, model selection, settings, inline command, theme, header/footer, compact-tool, and turn-context tests pass unchanged.
- `StopReason` now includes `"pending"` and assistant messages may include `rawStopReason`. Shrimpy's inference, compaction, context, recording, and turn-output code compiles and passes without exhaustive-union changes.

### Required Shrimpy Changes

- Pinned `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` to exact `0.83.0` in `package.json`.
- Pinned the Pi-facing `typebox` dependency to exact `1.3.7`; the isolated `@sinclair/typebox` configuration dependency remains unchanged.
- Regenerated `package-lock.json`; `npm ls` confirms the four Pi packages at `0.83.0` and `typebox` deduped at `1.3.7`.
- No source or test edits are currently required. Add a regression only if implementation or manual smoke testing reveals behavior not covered by the existing focused suite.

### Verification

- Disposable source: clean archive of Shrimpy commit `b70b8b69f6f5d38b23e6eef0bfbe6e5670bc7bb1` under `/tmp/pi083-probe/shrimpy`; no uncommitted Shrimpy changes were present or copied into the probe.
- `npm install --save-exact @earendil-works/pi-agent-core@0.83.0 @earendil-works/pi-ai@0.83.0 @earendil-works/pi-coding-agent@0.83.0 @earendil-works/pi-tui@0.83.0`: passed in the disposable checkout.
- `npm run build`: passed with unchanged Shrimpy source both before and after aligning direct `typebox` to `1.3.7`.
- `./node_modules/.bin/tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --skipLibCheck --allowImportingTsExtensions extensions/*.ts`: passed.
- Focused Pi integration slice covering inference, models, setup, skills/resources, sessions, compaction, daemon tools, and TUI compatibility: 216 tests, 216 passed with all four Pi packages and direct `typebox` aligned to `1.3.7`.
- Focused tool/resource/policy slice after TypeBox alignment: 24 tests, 24 passed; `npm ls typebox --all` showed `1.3.7` deduped across Shrimpy and Pi.
- A direct cross-version validation probe also confirmed that Pi `0.83.0` could compile a Shrimpy `typebox@1.1.38` schema, accept a valid call, and reject an invalid call before the alignment recommendation was applied.
- `npm run lint`: passed in the candidate checkout.
- Main-checkout `npm run build`: passed and rebuilt the linked local CLI, gateway, web inspector, and generated skill mirrors.
- Main-checkout focused Pi integration slice: 216 tests, 216 passed.
- Main-checkout extension typecheck and `npm run lint`: passed.
- Main-checkout `npm test`: passed the complete build and all 708 tests. The earlier sandboxed disposable run's watcher and checkout-name artifacts did not reproduce with normal filesystem permissions and the canonical checkout path.
- User-reported manual smoke test: passed on 2026-07-29.

### Upgrade Steps

1. Pinned all four Pi packages and direct `typebox` to exact `0.83.0` and `1.3.7` respectively and regenerated the lockfile.
2. Completed the source build, extension typecheck, focused 216-test Pi slice, full 708-test suite, and lint.
3. Updated `CHANGELOG.md` and this assessment.
4. Completed the user-run manual smoke test successfully.
5. Review and commit the coherent upgrade before release preparation.

### Risks And Unknowns

- The automated assessment did not independently exercise credential-backed provider calls, OAuth/API-key refresh, remote catalog refresh, live compaction, or interactive session replacement during streaming; the user-run manual smoke test passed.
- Pi's session replacement fix is favorable for Shrimpy, but its extra awaited abort can expose timing assumptions only visible in a real streaming TUI.
- `src/app/pi-internals.ts` and the five named private terminal compatibility seams remain outside Pi's semver contract even though their build and focused tests pass at `0.83.0`.
- `src/tui/turn-context-rendering.ts` remains necessary because the upstream release does not remove `CustomMessageComponent`'s reserved collapsed spacer.
- The available Node `23.6.0` satisfies Shrimpy's declared `>=22.19.0` range but is outside ESLint 10's supported engine range. Lint passed, but a Node 22 LTS or Node 24+ run remains the authoritative check.

## Extensibility Assessment

### Public Surfaces Used Well

Shrimpy already leans heavily on Pi's public SDK and extension system:

- Session creation and runtime replacement
- Session persistence, branching, navigation, and event subscriptions
- Tool registration, inspection, activation, and same-name overrides
- Commands, renderers, headers, footers, widgets, and lifecycle hooks
- Prompt and skill resource overrides
- Provider registration and model switching
- Context mutation and per-turn `before_agent_start` handling
- Compaction interception and session leases

These are the right seams for an application host. Shrimpy does not duplicate Pi's model loop, native tool-call protocol, transcript engine, or provider request machinery.

### Private And Compatibility Seams

The hackier integration points are concentrated in terminal composition and a few incomplete host APIs:

- `src/tui/inline-commands.ts` patches private editor submission, changelog handling, and transcript containers because Pi cannot publicly override built-in commands or append ephemeral transcript blocks.
- `src/tui/model-selection.ts` patches private autocomplete, key handling, selectors, and model-selector internals to hide commands, disable cycling, and add favorites.
- `src/tui/settings.ts` patches private settings and selector methods because Pi has no public settings-section composition API.
- `src/tui/turn-context-rendering.ts` patches `CustomMessageComponent.prototype` because a renderer with no collapsed content still leaves a reserved spacer.
- `src/app/pi-internals.ts` deep-imports theme registry, proxy, and automatic-theme helpers outside Pi's public export contract.
- `src/sessions/open.ts` assigns `session.state.systemPrompt` after creation. The public per-turn containment hook remains authoritative, but a host setter or stronger initialization contract would be cleaner.
- `src/sessions/compaction/runner.ts` owns a copy-like compaction path because `session_before_compact` can replace or cancel compaction but cannot augment the default instructions.

These gaps justify narrow upstream API requests, not turning Shrimpy into a Pi package. The useful asks are built-in command interception, composable settings sections, model-selector decoration, ephemeral transcript components, no-spacer collapsed renderers, exported theme preparation, compaction-instruction augmentation, and canonical model access in extension context.

## Pi Package Ecosystem

A Pi package is an npm package or git repository contributing `extensions/`, `skills/`, `prompts/`, or `themes/`. Pi can discover those resources by convention or explicit package metadata.

Shrimpy does not currently load the user's normal Pi package configuration. `createShrimpyResourceLoader()` uses `SettingsManager.inMemory()`, fixed bundled extension paths, explicit Shrimpy skill paths, and disabled ambient skill discovery. This is a sound default for a durable home agent but leaves useful ecosystem work inaccessible.

A Shrimpy-controlled package bridge should:

1. Add CLI commands to list, inspect, install, pin, enable, disable, update, and remove trusted Pi packages.
2. Store policy and provenance under the Shrimpy workspace rather than inheriting unrelated user-level or project-local Pi configuration.
3. Resolve only explicitly approved package resources into a session while retaining Shrimpy's context and tool-policy controls.
4. Treat extension code as full-trust executable code, expose its source and provenance, and never install from the network as an implicit session-start side effect.
5. Keep channels, watches, workers, surfaces, workspace state, and agent orchestration in Shrimpy core.
6. Let packages contribute session-local tools, commands, providers, renderers, prompts, themes, and optional skills.

This bridge should follow the `0.83.0` dependency upgrade rather than share its implementation.

## Relevant Pi Runtime Surfaces

### SDK And Sessions

Pi runs as an interactive CLI, print-mode CLI, JSON event stream, RPC subprocess, or embedded SDK. Sessions persist as JSONL trees with branching, forking, naming, navigation, and compaction.

Useful host objects include `createAgentSession()`, `SessionManager`, `SettingsManager`, `DefaultResourceLoader`, and `ModelRuntime`. The session exposes prompting, steering, queued follow-ups, subscriptions, aborts, compaction, model and thinking changes, tree navigation, active-tool control, reload, and disposal.

### Extension API

Extensions can register tools, commands, providers, renderers, shortcuts, flags, and UI components. They can persist custom session entries, inject user or system messages, inspect and activate tools, and intercept resource discovery, session lifecycle, model requests, agent turns, tool calls, input, compaction, and tree navigation.

Tool policy is composable through SDK allowlists and denylists, active-tool APIs, additive custom tools, and same-name tool replacement. Pi passes active tool schemas to providers and executes validated model calls.

### Prompt And Resources

`DefaultResourceLoader` controls system prompts, appended prompt text, instruction files, extensions, skills, prompts, and themes. Shrimpy supplies a complete assembled system prompt, strips ambient Pi instruction and skill layers, and loads a curated extension set. Pi continues to own provider-native tool definitions and interactive command handling.

The focused [Pi skill handling note](pi-skill-handling.md) covers skill discovery, additional paths, slash-command expansion, and the Shrimpy integration gap in more detail.

### Background Work And Multi-Agent Scope

Pi has no durable background daemon or native cross-agent orchestration layer. Extensions can schedule work inside one session, and external supervisors can prompt sessions or drive RPC, but Shrimpy's watches, channels, workers, and multi-agent routing remain application-level responsibilities.

The upstream `packages/mom/` example demonstrates one external messaging channel driving queued Pi sessions. It is useful prior art for routing but is narrower than Shrimpy's multi-channel, multi-agent workspace.

## Implementation Sequence

1. The `0.82.1` model-runtime, setup, dynamic-catalog, provider, session, and custom-compaction migration is complete on `main`.
2. Implemented `0.83.0` as a focused dependency update: all four Pi packages are pinned together, direct `typebox` is aligned to `1.3.7`, and the lockfile is regenerated.
3. Completed the source and extension typechecks, the focused Pi integration slice, the full suite/build, and lint.
4. Completed the user-run manual smoke test successfully.
5. Review and commit the changelog, dependency, lockfile, and research-note changes.
6. Design the package bridge separately after the upgraded runtime is stable.

## Sources

[Repository](https://github.com/earendil-works/pi) · [`v0.83.0` tag](https://github.com/earendil-works/pi/tree/v0.83.0) · [`v0.82.1...v0.83.0` comparison](https://github.com/earendil-works/pi/compare/v0.82.1...v0.83.0) · [Coding-agent changelog](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/CHANGELOG.md) · [AI changelog](https://github.com/earendil-works/pi/blob/v0.83.0/packages/ai/CHANGELOG.md) · [SDK](https://raw.githubusercontent.com/earendil-works/pi/v0.83.0/packages/coding-agent/docs/sdk.md) · [Extensions](https://raw.githubusercontent.com/earendil-works/pi/v0.83.0/packages/coding-agent/docs/extensions.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/v0.83.0/packages/coding-agent/docs/models.md) · [Custom providers](https://raw.githubusercontent.com/earendil-works/pi/v0.83.0/packages/coding-agent/docs/custom-provider.md) · [Packages](https://raw.githubusercontent.com/earendil-works/pi/v0.83.0/packages/coding-agent/docs/packages.md) · [Themes](https://raw.githubusercontent.com/earendil-works/pi/v0.83.0/packages/coding-agent/docs/themes.md)
