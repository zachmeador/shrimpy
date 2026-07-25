# 🦐 Pi Coding Agent

Date: 2026-06-11
Updated: 2026-07-25
Status: Research

Pi is Shrimpy's embedded agent and session engine. Shrimpy pins the registry-published `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` packages rather than depending on a local checkout or active fork.

This note describes the architectural boundary, the latest stable upgrade assessment, and how Shrimpy can use more of Pi's package ecosystem without becoming a Pi package itself.

## Architectural Position

Shrimpy should remain an application built on Pi's SDK. Pi owns the model/tool loop, provider dispatch, transcript mechanics, session tree, compaction primitives, extension runtime, and interactive terminal foundation. Shrimpy owns durable workspaces, agents, channels, surfaces, watches, workers, routing, policy, and long-lived services.

A Pi package has a session-level lifecycle and contributes extensions, skills, prompts, themes, or providers. Moving all of Shrimpy into that lifecycle would invert the ownership boundary and force durable home-agent services into an agent-session plugin. Pi packages should instead be optional capabilities hosted by Shrimpy.

## Current Shrimpy Integration

- Shrimpy pins all four Pi packages at `0.80.6`.
- Shrimpy requires Node `>=22.19.0`, matching Pi's runtime requirement.
- Pi-facing tool schemas use `typebox` 1.x. Shrimpy-owned configuration schemas can use a different schema library when their types never cross the Pi tool boundary.
- The main host boundary uses `createAgentSession()`, `createAgentSessionRuntime()`, `SessionManager`, `SettingsManager`, and `DefaultResourceLoader`.
- `SessionBootstrap` still constructs the now-replaced `AuthStorage` and `ModelRegistry` pair and passes both through session creation and replacement.
- Shrimpy extensions register tools, commands, headers, footers, custom UI, message renderers, lifecycle hooks, model-switch rendering, activity state, turn context, session leases, and compaction interception through public extension APIs.
- Resource-loader overrides let Shrimpy own prompt assembly and visible skill selection while Pi retains native tool definitions, provider calls, transcript mechanics, and the interactive runtime.
- Pi's session replacement lifecycle powers Shrimpy's cross-agent and cross-session navigator.
- Normal `npm test` does not typecheck `extensions/*.ts`; Pi upgrades need a separate extension typecheck.
- `ToolRenderContext` remains internal. Shrimpy compact-tool renderers use local structural typing rather than importing a private type.

Shrimpy deliberately creates Pi settings in memory and passes a fixed set of bundled extension and skill paths. This keeps sessions deterministic and prevents ambient Pi configuration from silently changing a home agent, but it also means Shrimpy cannot currently consume normal Pi packages.

## Latest Stable Pi

The latest stable tag inspected on 2026-07-25 is `v0.82.1`. Shrimpy remains on `0.80.6`, so the next upgrade is a model-runtime migration rather than a package-only bump.

Upgrade-relevant changes after `0.80.6`:

- `0.80.7` adds deferred tool loading and changes session-affinity configuration.
- `0.80.8` introduces canonical `ModelRuntime`, moves authentication and model catalogs under provider-owned runtime state, replaces the SDK's `authStorage` and `modelRegistry` options with `modelRuntime`, removes `AuthStorage` from the coding-agent root exports, and leaves `ModelRegistry` as a compatibility facade.
- `0.81.0` adds provider extensions, llama.cpp support, generated provider catalogs, and broader usage accounting for tools, compaction, and branch summaries.
- `0.81.1` adds bounded retry behavior and lifecycle events for compaction and branch summaries, plus a compatibility fix for custom stream functions.
- `0.82.0` adds constrained tool sampling, OpenRouter and Kimi Code login, session metadata for bash tools, stricter generated reasoning-level metadata, and a required `outputPad` field in message-renderer options. Its breaking `AgentHarness` tool-context change does not affect Shrimpy's current `AgentMessage` and `ThinkingLevel` imports.
- `0.82.1` adds ETag-backed model-catalog persistence, Anthropic gateway bearer auth, Claude Opus 5 metadata, and clearer model/auth errors.

Pi's upstream `main` was one post-release bookkeeping commit beyond `v0.82.1` during the assessment. The upgrade target is the stable tag and published packages, not unreleased branch state.

## `0.82.1` Upgrade Assessment

The upstream clone at `/Users/zachmeador/gits/pi-mono` was fetched and fast-forwarded before inspection. Stable `v0.82.1` is commit `b4f293684bba718d59cc1157679bcf6157b3a7f5`; the inspected upstream `main` was `5bc1c2c0a6f07e00e8c240304182f213ab8d311f`.

A disposable probe was created from clean Shrimpy commit `b01cd08f5840c89e4aaabb807ecfa172e70b9736`. The main checkout was clean when the assessment began; the developer-skill and research-note edits made for this assessment were intentionally excluded from the probe. All four published Pi packages installed successfully at exact `0.82.1`.

Recommendation: do not update the package pins alone. Implement the `ModelRuntime` migration and the named test/runtime repairs in one focused upgrade branch, then pin all four packages together. Confidence is high because the published candidate packages were installed and exercised against both compile-time and targeted runtime seams.

Verification results:

- Current Shrimpy `0.80.6` source typecheck and bundled-extension typecheck passed.
- The five focused baseline files that later exposed candidate failures passed all 19 tests on `0.80.6`.
- Disposable `0.82.1` bundled-extension typecheck passed.
- Disposable `npm run build` failed with 19 source errors localized to `src/app/pi-internals.ts`, `src/sessions/bootstrap.ts`, `src/sessions/open.ts`, `src/setup/coding-policy.ts`, and `src/setup/model-access.ts`. These are the same migration errors found at `0.81.1`; `0.82.x` adds no new source compile failures.
- Three targeted candidate slices ran 34 tests: 29 passed and 5 failed. `test/tui-command-surface.test.ts`, `test/tui-model-selection.test.ts`, and `test/tui-theme.test.ts` could not load the deleted `dist/core/provider-display-names.js`; `test/session-runtime.test.ts` could not load the removed `AuthStorage` export; and `test/tui-activity-indicator.test.ts` exposed a footer fixture that supplies `modelRegistry` where Pi now reads `session.modelRuntime`.
- Compaction-runner, compact-tool, model-switch-renderer, resource-loader, thinking, public-surface, settings, and turn-context-rendering checks passed under the candidate packages.
- The full candidate suite was not run because the source build is a prerequisite. The probe used Node `23.6.0`, which satisfies Shrimpy's declared range but is outside ESLint 10's supported engine range; implementation lint verification should use Node 22 LTS or Node 24+.
- The compatibility probe changed no package pins, lockfiles, source, tests, generated output, or live workspace state in the main checkout.

### Primary Migration

`ModelRuntime` is the public replacement for Shrimpy's separate auth-storage and model-registry construction. It owns providers, models, credentials, login, catalog refresh, provider metadata, and completion dispatch.

The upgrade should:

1. Create one `ModelRuntime` in `SessionBootstrap` with explicit `state/pi/auth.json`, `state/pi/models.json`, and `state/pi/models-store.json` paths.
2. Pass that runtime through `createAgentSession()`, `AgentSessionServices`, session replacement, model resolution, commands, and tests; remove Shrimpy's separate `authStorage` and `modelRegistry` service fields.
3. Move setup model listing, policy resolution, refresh, API-key login, and OAuth login to asynchronous `ModelRuntime` operations and provider-owned `AuthInteraction`.
4. Replace `ModelRegistry.find()`, `getAll()`, `getAvailable()`, and model-shaped auth checks with `ModelRuntime.getModel()`, `getModels()`, `getAvailable()`, `checkAuth()`, and `hasConfiguredAuth(providerId)`.
5. Remove the deleted private provider-display-name import and use the public `Provider.name` values returned by `ModelRuntime.getProviders()`.
6. Add the dynamic catalog store to workspace paths, update protection and development-state copying, and document it as durable Pi state.
7. Update test providers and runtime fixtures rather than recreating the removed auth/model compatibility shape. In particular, give the footer fixture `modelRuntime.isUsingOAuth(providerId)` and pass `outputPad` when tests directly invoke registered message renderers.
8. Pin all four Pi packages to exact `0.82.1` together only when the implementation is ready.

No repository or inspected workspace model entry used the removed `compat.sendSessionIdHeader` field. If one appears elsewhere, it must move to `compat.sessionAffinityFormat`.

### Compaction

Shrimpy's custom compaction runner still imports `completeSimple` through Pi's temporary `/compat` entrypoint. That code compiles and its focused tests pass at `0.82.1`, but it bypasses the canonical runtime, requires an API key even though Pi now supports header-only provider auth, omits provider-scoped environment data, does not aggregate summary-call usage, and misses Pi's summarization retry lifecycle, fresh routing session IDs, and disabled prompt caching for summary requests.

The upgrade should inject `ModelRuntime.completeSimple()` into custom compaction, support header-only auth, preserve provider environment, combine usage across chunk and merge calls, create fresh summary routing IDs with prompt caching disabled, and either implement equivalent bounded retries or delegate more of compaction back to Pi.

### Upgrade Risks

- Model availability, refresh, and login are genuinely asynchronous under `ModelRuntime`. Shrimpy should carry that boundary through setup and policy code instead of hiding it behind synchronous casts or wrappers.
- `ModelRuntime.create()` defaults to an offline initial catalog refresh, but `InteractiveMode.run()` starts a background network refresh unless `PI_OFFLINE` is set. Shrimpy needs an explicit startup, timeout, and offline policy.
- The custom compaction path needs behavioral work beyond changing an import.
- Private terminal integration seams can break without a semver-visible export change.
- Pi `0.82.1` now passes `outputPad` to custom renderers, but `CustomMessageComponent` still adds an unconditional leading spacer, so `src/tui/turn-context-rendering.ts` remains necessary.
- Implementation verification should use a Node release supported by Shrimpy and the repository's lint toolchain.

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
- `src/app/pi-internals.ts` deep-imports theme registry, proxy, and automatic-theme helpers outside Pi's public export contract. The provider-display-name deep import is deleted in the candidate packages and can be replaced by public runtime metadata.
- `src/sessions/open.ts` assigns `session.state.systemPrompt` after creation. The public per-turn containment hook remains authoritative, but a host setter or stronger initialization contract would be cleaner.
- `src/sessions/compaction-runner.ts` owns a copy-like compaction path because `session_before_compact` can replace or cancel compaction but cannot augment the default instructions.

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

This bridge should follow the `0.82.1` runtime migration rather than share its implementation.

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

1. Begin from an intentional Shrimpy git state on a focused upgrade branch or disposable implementation worktree.
2. Add the dynamic model catalog store to Shrimpy's workspace path and protection surfaces.
3. Introduce one canonical `ModelRuntime` in bootstrap and migrate session services to it.
4. Migrate model commands and setup flows, including asynchronous provider login and refresh.
5. Remove the private provider-name import.
6. Move custom compaction off `/compat` and add usage and retry behavior.
7. Update runtime, provider, setup, compaction, and session-replacement tests.
8. Install all four exact `0.82.1` pins and update the lockfile.
9. Run source and extension typechecks, focused suites, the full suite, build, and lint.
10. Smoke API-key and subscription login, local providers, model selection and favorites, settings, automatic themes, session switching, compaction, and resume.
11. Design the package bridge separately after the runtime upgrade is stable.

## Sources

[Repository](https://github.com/earendil-works/pi) · [Coding agent README](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#readme) · [SDK](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md) · [Extensions](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/models.md) · [Custom providers](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/custom-provider.md) · [Packages](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/packages.md) · [Themes](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/themes.md)
