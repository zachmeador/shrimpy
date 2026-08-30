# 🦐 Pi Coding Agent

Date: 2026-06-11
Updated: 2026-08-30
Status: `0.84.4` implemented; automated verification passed; manual smoke test pending

Pi is Shrimpy's embedded agent and session engine. Shrimpy pins the registry-published `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` packages rather than depending on a local checkout or active fork.

This note describes the architectural boundary, the latest stable upgrade assessment, and how Shrimpy can use more of Pi's package ecosystem without becoming a Pi package itself.

## Architectural Position

Shrimpy should remain an application built on Pi's SDK. Pi owns the model/tool loop, provider dispatch, transcript mechanics, session tree, compaction primitives, extension runtime, and interactive terminal foundation. Shrimpy owns durable workspaces, agents, channels, surfaces, watches, workers, routing, policy, and long-lived services.

A Pi package has a session-level lifecycle and contributes extensions, skills, prompts, themes, or providers. Moving all of Shrimpy into that lifecycle would invert the ownership boundary and force durable home-agent services into an agent-session plugin. Pi packages should instead be optional capabilities hosted by Shrimpy.

## Current Shrimpy Integration

- Shrimpy pins all four Pi packages at `0.84.4`.
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

The latest stable tag inspected on 2026-08-30 is `v0.84.4` at `b79e4cc834970cca69daebffab7df1da7d1e52c4`. Shrimpy now pins that release.

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at exact `0.84.4`.
- Latest stable Pi version inspected: tag `v0.84.4`, commit `b79e4cc834970cca69daebffab7df1da7d1e52c4`.
- Pi retains Node `>=22.19.0` and `typebox` `1.3.7`, so Shrimpy's runtime and tool-schema dependency boundaries stay aligned.
- Declared breaking changes replace the agent-core harness session APIs, rename AI request-transform and Google thinking-level types, tighten dynamic-provider refresh and auth cancellation contracts, and change when `prepareNextTurn` hooks run. Shrimpy does not import those surfaces.
- Coding-agent changes relevant to Shrimpy make credential mutations synchronize cache-only model state, make model and thinking selections session-scoped unless explicitly saved, add compaction-failure events, compact oversized tool results before the next model call, and improve nested skill discovery.
- AI and tool changes add provider-neutral tool choice, strict-schema normalization, request cancellation, and many provider fixes. The focused tool, inference, compaction, and session probes pass against the published packages.
- TUI changes are broad, including fullscreen search and layout work, model/thinking selectors, and subscription-aware footer rendering. Shrimpy's five named private compatibility seams still pass after updating one footer test double.

Pi's upstream `main` was one post-release `[Unreleased]` bookkeeping commit beyond `v0.84.4` during the assessment, at `853a80d26c90a14c1886f0ebb8ffaae133ca2185`. The upgrade target is the stable tag and published packages, not unreleased branch state.

## `0.84.4` Upgrade Assessment

Shrimpy checkout: `/Users/zachmeador/gits/shrimpy`; implementation based on `main` at `7e28527a6a617c4949ad31c086a26e373bd9f7cd`

Pi clone: `/Users/zachmeador/gits/pi-mono`; stable tag `v0.84.4` at `b79e4cc834970cca69daebffab7df1da7d1e52c4`; inspected `main` at `853a80d26c90a14c1886f0ebb8ffaae133ca2185`

### Summary

The `0.84.4` upgrade is implemented as a small coordinated source-and-test change. Confidence is high for automated compatibility: the build, extension typecheck, lint, 191-test focused Pi slice, and complete 738-test suite pass in the main checkout. A manual provider and streaming-TUI smoke test remains necessary before release.

### Versions

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at exact `0.84.4`.
- Latest stable Pi version inspected: tag `v0.84.4`, commit `b79e4cc834970cca69daebffab7df1da7d1e52c4`.
- Current Shrimpy Pi-facing TypeBox package: `typebox` at exact `1.3.7`.

### Likely Breakage

- `src/sessions/context-inspection.ts` does not compile unchanged. `ModelRuntime.setRuntimeApiKey()` now accepts `AuthOperationOptions`, so its third argument may contain `signal` but not `{ allowNetwork: false }`; the unchanged build fails with `TS2353` at line 106. Remove the obsolete argument. Pi `0.84.4` synchronizes the affected provider's cache and availability without a network catalog refresh, preserving the inspection path's intent.
- The same obsolete `setRuntimeApiKey()` option remains in `test/context-parity.test.ts` and twice in `test/sessions.test.ts`. Node's type-stripping test runner ignores the extra property at runtime, but those calls should be updated with the production code so the tests describe the current contract.
- `test/tui-activity-indicator.test.ts` mocks `modelRuntime.isUsingOAuth()`. Pi's private `FooterComponent` now calls `isUsingSubscription()`, so the focused slice initially failed with `TypeError: this.session.modelRuntime.isUsingSubscription is not a function`. Change the test double to `isUsingSubscription: () => false`; production already uses Pi's real `ModelRuntime` and needs no matching source edit.
- Shrimpy does not use agent-core's replaced harness session APIs, `ModelsStreamTransforms`, `GoogleThinkingLevel`, handwritten dynamic `Provider.refreshModels()`, or `prepareNextTurn`, so the other declared breaking changes do not require edits. The source build and extension typecheck validate the public imports after the one source adjustment.
- `src/tools/daemon.ts` continues to share `typebox` `1.3.7` with Pi. The tool and full-suite probes pass through Pi's new strict-schema normalization without schema changes.
- Pi changed compaction timing, model/thinking persistence, skill discovery, selectors, footer rendering, and other interactive internals. Shrimpy's compaction, resource, session replacement, model selection, settings, inline command, theme, header/footer, compact-tool, and turn-context tests pass after the footer fixture update.

### Required Shrimpy Changes

- Pinned `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` to exact `0.84.4` in `package.json` and regenerated `package-lock.json`.
- Removed `{ allowNetwork: false }` from the `ModelRuntime.setRuntimeApiKey()` call in `src/sessions/context-inspection.ts`, `test/context-parity.test.ts`, and the two affected calls in `test/sessions.test.ts`.
- Replaced the `isUsingOAuth` method in the `test/tui-activity-indicator.test.ts` model-runtime double with `isUsingSubscription`.
- Kept direct `typebox` at `1.3.7` and `@sinclair/typebox` at `0.34.41`.
- Updated `CHANGELOG.md` and this note. No other source or test changes were required.

### Verification

- Disposable source: clean archive of Shrimpy commit `9307ed089f2238f0347d83915e3cb6c1cd403995` under `/tmp/pi0844-verify.nWopwu/shrimpy`; the main checkout's existing uncommitted documentation changes were not copied into the probe.
- `npm install --save-exact @earendil-works/pi-agent-core@0.84.4 @earendil-works/pi-ai@0.84.4 @earendil-works/pi-coding-agent@0.84.4 @earendil-works/pi-tui@0.84.4`: passed in the disposable checkout.
- `npm run build` against unchanged Shrimpy source: failed with `TS2353` because `src/sessions/context-inspection.ts` passed `allowNetwork` to `AuthOperationOptions`.
- `npm run build` after removing that obsolete option in the disposable checkout: passed, including the CLI, gateway, web inspector, and generated skill mirrors.
- `./node_modules/.bin/tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --skipLibCheck --allowImportingTsExtensions extensions/*.ts`: passed.
- The first focused Pi integration run passed 190 of 191 tests and exposed the stale footer test double. After updating it, the same inference, models, setup, skills/resources, sessions, compaction, daemon-tool, and TUI slice passed 191 of 191 tests.
- `npm ls @earendil-works/pi-agent-core @earendil-works/pi-ai @earendil-works/pi-coding-agent @earendil-works/pi-tui typebox --all`: confirmed the four requested packages at `0.84.4` and `typebox` `1.3.7` deduped across Shrimpy and Pi where package boundaries allow.
- `npm run lint`: passed in the candidate checkout.
- The first sandboxed full-suite run passed 734 of 738 tests, skipped one loopback test, and failed three environment-sensitive cases: two `fs.watch()` tests hit `EMFILE`, and one worker assertion rejected the disposable checkout's noncanonical directory name. The worker case passed after moving the probe under a `shrimpy/` directory, and the watcher file passed 17 of 17 tests outside the sandbox.
- Final `npm test` in the corrected disposable checkout with normal filesystem permissions: passed the build and all 738 tests with no failures or skips.
- Main-checkout `npm install --save-exact @earendil-works/pi-agent-core@0.84.4 @earendil-works/pi-ai@0.84.4 @earendil-works/pi-coding-agent@0.84.4 @earendil-works/pi-tui@0.84.4`: passed and updated the linked development dependency tree.
- Main-checkout `npm run build`: the first sandboxed run passed TypeScript and the web build but failed generated-skill sync with `EPERM`; the same command passed with normal repository permissions.
- Main-checkout extension typecheck and `npm run lint`: passed.
- Main-checkout focused Pi integration slice: 191 tests, 191 passed.
- Main-checkout `npm test` with normal filesystem and loopback permissions: passed the build and all 738 tests with no failures or skips.
- Manual credential-backed provider and streaming-TUI smoke tests have not run.

### Upgrade Steps

1. Pinned all four Pi packages to exact `0.84.4` and regenerated the lockfile without changing either TypeBox dependency.
2. Removed the obsolete `allowNetwork` option from the four source and test `setRuntimeApiKey()` calls.
3. Updated the footer test double to provide `isUsingSubscription()`.
4. Passed the source build, extension typecheck, focused Pi integration slice, lint, and complete test suite.
5. Manually smoke-test a credential-backed provider call, model and thinking selection, session replacement during streaming, footer rendering, and compaction after a large tool result.
6. Review and commit the coherent upgrade, then record the smoke-test result before release.

### Risks And Unknowns

- The automated assessment did not exercise credential-backed provider calls, OAuth refresh, remote catalog refresh, or provider-specific network adapters. Pi `0.84.x` changes cancellation and credential synchronization enough that these need a manual smoke test.
- Pi now compacts oversized tool results before the next assistant call and changes model/thinking persistence in the interactive selector. The automated tests pass, but live streaming compaction and selector behavior remain unverified.
- `src/app/pi-internals.ts` and the five named private terminal compatibility seams remain outside Pi's semver contract even though their build and focused tests pass at `0.84.4`.
- `src/tui/turn-context-rendering.ts` remains necessary because the upstream release does not remove `CustomMessageComponent`'s reserved collapsed spacer.
- The probe used Node `26.7.0` and npm `11.19.0`. Both Shrimpy and Pi declare Node `>=22.19.0`; a supported Node 22 or 24 runtime smoke test would better match likely deployments.

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

This bridge should follow the `0.84.4` dependency upgrade rather than share its implementation.

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
2. The `0.83.0` dependency update and `typebox` `1.3.7` alignment are implemented and manually smoke-tested.
3. Implemented `0.84.4` as a coordinated package, lockfile, context-inspection API, and footer-fixture update.
4. Passed the source build, extension typecheck, 191-test focused slice, lint, and 738-test full suite in the implementation checkout.
5. Review and commit the coherent upgrade after automated verification.
6. Complete the credential-backed provider and streaming-TUI smoke tests, then update the result in this note before release.
7. Design the package bridge separately after the upgraded runtime is stable.

## Sources

[Repository](https://github.com/earendil-works/pi) · [`v0.84.4` tag](https://github.com/earendil-works/pi/tree/v0.84.4) · [`v0.83.0...v0.84.4` comparison](https://github.com/earendil-works/pi/compare/v0.83.0...v0.84.4) · [Agent-core changelog](https://github.com/earendil-works/pi/blob/v0.84.4/packages/agent/CHANGELOG.md) · [Coding-agent changelog](https://github.com/earendil-works/pi/blob/v0.84.4/packages/coding-agent/CHANGELOG.md) · [AI changelog](https://github.com/earendil-works/pi/blob/v0.84.4/packages/ai/CHANGELOG.md) · [TUI changelog](https://github.com/earendil-works/pi/blob/v0.84.4/packages/tui/CHANGELOG.md) · [SDK](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/docs/sdk.md) · [Extensions](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/docs/extensions.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/docs/models.md) · [Skills](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/docs/skills.md) · [Themes](https://raw.githubusercontent.com/earendil-works/pi/v0.84.4/packages/coding-agent/docs/themes.md)
