# 🦐 Pi Coding Agent

Date: 2026-06-11
Updated: 2026-07-25
Status: Implemented; awaiting final review

Pi is Shrimpy's embedded agent and session engine. Shrimpy pins the registry-published `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` packages rather than depending on a local checkout or active fork.

This note describes the architectural boundary, the latest stable upgrade assessment, and how Shrimpy can use more of Pi's package ecosystem without becoming a Pi package itself.

## Architectural Position

Shrimpy should remain an application built on Pi's SDK. Pi owns the model/tool loop, provider dispatch, transcript mechanics, session tree, compaction primitives, extension runtime, and interactive terminal foundation. Shrimpy owns durable workspaces, agents, channels, surfaces, watches, workers, routing, policy, and long-lived services.

A Pi package has a session-level lifecycle and contributes extensions, skills, prompts, themes, or providers. Moving all of Shrimpy into that lifecycle would invert the ownership boundary and force durable home-agent services into an agent-session plugin. Pi packages should instead be optional capabilities hosted by Shrimpy.

## Current Shrimpy Integration

- Shrimpy pins all four Pi packages at `0.82.1`.
- Shrimpy requires Node `>=22.19.0`, matching Pi's runtime requirement.
- Pi-facing tool schemas use `typebox` 1.x. Shrimpy-owned configuration schemas can use a different schema library when their types never cross the Pi tool boundary.
- The main host boundary uses `createAgentSession()`, `createAgentSessionRuntime()`, `SessionManager`, `SettingsManager`, and `DefaultResourceLoader`.
- `SessionBootstrap` constructs one canonical `ModelRuntime` with workspace-local auth, custom-model, and dynamic-catalog paths and passes it through session creation and replacement.
- Shrimpy extensions register tools, commands, headers, footers, custom UI, message renderers, lifecycle hooks, model-switch rendering, activity state, turn context, session leases, and compaction interception through public extension APIs.
- Resource-loader overrides let Shrimpy own prompt assembly and visible skill selection while Pi retains native tool definitions, provider calls, transcript mechanics, and the interactive runtime.
- Pi's session replacement lifecycle powers Shrimpy's cross-agent and cross-session navigator.
- Normal `npm test` does not typecheck `extensions/*.ts`; Pi upgrades need a separate extension typecheck.
- `ToolRenderContext` remains internal. Shrimpy compact-tool renderers use local structural typing rather than importing a private type.

Shrimpy deliberately creates Pi settings in memory and passes a fixed set of bundled extension and skill paths. This keeps sessions deterministic and prevents ambient Pi configuration from silently changing a home agent, but it also means Shrimpy cannot currently consume normal Pi packages.

## Latest Stable Pi

The latest stable tag inspected on 2026-07-25 is `v0.82.1`. Shrimpy now pins that release after completing the required model-runtime migration.

Upgrade-relevant changes after `0.80.6`:

- `0.80.7` adds deferred tool loading and changes session-affinity configuration.
- `0.80.8` introduces canonical `ModelRuntime`, moves authentication and model catalogs under provider-owned runtime state, replaces the SDK's `authStorage` and `modelRegistry` options with `modelRuntime`, removes `AuthStorage` from the coding-agent root exports, and leaves `ModelRegistry` as a compatibility facade.
- `0.81.0` adds provider extensions, llama.cpp support, generated provider catalogs, and broader usage accounting for tools, compaction, and branch summaries.
- `0.81.1` adds bounded retry behavior and lifecycle events for compaction and branch summaries, plus a compatibility fix for custom stream functions.
- `0.82.0` adds constrained tool sampling, OpenRouter and Kimi Code login, session metadata for bash tools, stricter generated reasoning-level metadata, and a required `outputPad` field in message-renderer options. Its breaking `AgentHarness` tool-context change does not affect Shrimpy's current `AgentMessage` and `ThinkingLevel` imports.
- `0.82.1` adds ETag-backed model-catalog persistence, Anthropic gateway bearer auth, Claude Opus 5 metadata, and clearer model/auth errors.

Pi's upstream `main` was one post-release bookkeeping commit beyond `v0.82.1` during the assessment. The upgrade target is the stable tag and published packages, not unreleased branch state.

## `0.82.1` Upgrade Assessment

Shrimpy checkout: `/Users/zachmeador/gits/shrimpy`, branch `codex/pi-0.82.1-upgrade`, based on commit `b115bc63d09cc61fe13ae6c89d5254019abeecb0`

Pi clone: `/Users/zachmeador/gits/pi-mono`; stable tag `v0.82.1` at `b4f293684bba718d59cc1157679bcf6157b3a7f5`; inspected `main` at `5bc1c2c0a6f07e00e8c240304182f213ab8d311f`

### Summary

Upgrade implemented on a focused branch with all four Pi packages pinned together. The result is ready for final review after the verification listed below. Confidence is high: the canonical runtime, setup login/refresh, session replacement, model resolution, dynamic catalog storage, and custom compaction paths have all been migrated and exercised by focused tests.

### Versions

- Current Shrimpy Pi packages: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` at exact `0.82.1`.
- Latest stable Pi version inspected: tag `v0.82.1`, commit `b4f293684bba718d59cc1157679bcf6157b3a7f5`.

### Likely Breakage

- The pre-migration build produced 19 errors in `src/app/pi-internals.ts`, `src/sessions/bootstrap.ts`, `src/sessions/open.ts`, `src/setup/coding-policy.ts`, and `src/setup/model-access.ts` because Pi removed the root `AuthStorage` export, replaced SDK `authStorage`/`modelRegistry` services with `modelRuntime`, and deleted the private provider-display-name module.
- Setup model availability and provider login became asynchronous and provider-owned. Retaining synchronous setup casts would have produced stale availability and incomplete OAuth/API-key flows.
- Session, footer, and resolver fixtures using `modelRegistry` failed at runtime because Pi reads `session.modelRuntime`.
- The old custom compaction hook compiled through Pi's compatibility entrypoint but would have bypassed header-only and provider-environment auth, usage accounting, bounded retries, fresh routing IDs, and summary cache policy.
- Pi's dynamic provider catalogs require a durable `models-store.json` path to retain refreshed model lists for offline startup.

### Required Shrimpy Changes

- Replaced separate auth/model services with one offline-initialized `ModelRuntime` in `SessionBootstrap`, session creation, runtime replacement, commands, resolvers, context inspection, and tests.
- Migrated setup listing, policy checks, explicit catalog refresh, API-key login, OAuth login, provider metadata, and prompt/event handling to public `ModelRuntime` and `AuthInteraction` APIs.
- Added `state/pi/models-store.json` to workspace paths, setup development-state copying, tests, and reference docs.
- Removed the deleted provider-display-name deep import and use public `Provider.name` and provider auth metadata.
- Replaced the path-loaded compaction hook with a runtime-injected extension factory. Compaction calls `ModelRuntime.completeSimple()`, uses Pi retry policy, disables summary cache retention, creates a fresh routing id per summary request, and combines usage across split/chunk/merge calls.
- Updated all runtime fixtures to use `modelRuntime` rather than recreating removed compatibility services.
- Pinned all four packages and regenerated the lockfile at exact `0.82.1`.

### Verification

- Baseline disposable probe from clean Shrimpy commit `b01cd08f5840c89e4aaabb807ecfa172e70b9736`: exact `0.82.1` install passed; source build exposed the 19 expected migration errors; targeted candidate tests passed 29 of 34 before implementation.
- `./node_modules/.bin/tsc --noEmit`: passed after implementation.
- `./node_modules/.bin/tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --skipLibCheck --allowImportingTsExtensions extensions/*.ts`: passed.
- Focused migrated failure slice covering context inspection, model defaults, resources, session restore/resolution/tool policy, real session construction, setup, and footer activity: 64 tests, 64 passed after fixture migration.
- Focused compaction/setup/catalog/workspace slice: 25 tests, 25 passed, including transient summary retry, aggregate usage, disabled cache retention, and distinct routing ids.
- `npm run lint`: passed.
- `npm test`: passed the complete build and all 657 tests. The first implementation run had passed 609 of 625 tests; all 16 failures were stale removed-service fixtures, which were migrated before the clean final run.
- Live TUI smoke test: `/login` completed an Anthropic subscription account login successfully.

### Upgrade Steps

1. Pin all four Pi packages to exact `0.82.1` and regenerate the npm lockfile.
2. Add the dynamic catalog store path and construct the canonical runtime during bootstrap.
3. Pass the runtime through every session, model-resolution, setup, command, and inspection boundary.
4. Migrate setup login and refresh to provider-owned asynchronous APIs and remove the deleted private provider-name import.
5. Route custom compaction through `ModelRuntime.completeSimple()` with retry, routing, cache, and usage parity.
6. Replace stale service fixtures and extend compaction, workspace-path, catalog-store, and resource-loader coverage.
7. Update current-behavior docs, the changelog, and this assessment.
8. Run source and extension typechecks, focused tests, full tests/build, lint, and manual smoke checks where credentials and a TTY are available.

### Risks And Unknowns

- Setup-wizard login, API-key provider login, dynamic remote catalog refresh, live model calls, and live compaction require credentials/network and remain manual smoke-test surfaces. Anthropic subscription login through the TUI `/login` command passed.
- Bootstrap is explicitly offline and setup's manual refresh is bounded at 15 seconds. Pi's TUI retains its own non-blocking background refresh unless `PI_OFFLINE` is set.
- Private terminal theme and UX integration seams can still break without a semver-visible export change.
- Pi `0.82.1` now passes `outputPad` to custom renderers, but `CustomMessageComponent` still adds an unconditional leading spacer, so `src/tui/turn-context-rendering.ts` remains necessary.
- The available Node `23.6.0` satisfies Shrimpy's declared `>=22.19.0` range but is outside ESLint 10's supported engine range. A Node 22 LTS or Node 24+ lint run is the authoritative lint check.

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

1. Completed the implementation on `codex/pi-0.82.1-upgrade` from an intentional clean Shrimpy state.
2. Added the dynamic model catalog store to Shrimpy's workspace paths, development-state copying, tests, and reference docs.
3. Introduced one canonical `ModelRuntime` in bootstrap and migrated session services to it.
4. Migrated model commands and setup flows, including asynchronous provider login and bounded explicit refresh.
5. Removed the private provider-name import.
6. Moved custom compaction off `/compat` and added canonical auth, usage, retry, routing, and cache behavior.
7. Updated runtime, provider, setup, compaction, context-inspection, footer, and session-replacement tests.
8. Installed all four exact `0.82.1` pins and updated the lockfile.
9. Completed the clean source/extension typechecks, full suite/build, and lint verification recorded above.
10. During final review, smoke setup-wizard and API-key login, dynamic and local providers, model selection and favorites, settings, automatic themes, session switching, compaction, and resume where the necessary TTY, credentials, and provider access are available. Anthropic subscription login through `/login` has passed.
11. Design the package bridge separately after the runtime upgrade is stable.

## Sources

[Repository](https://github.com/earendil-works/pi) · [Coding agent README](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#readme) · [SDK](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/sdk.md) · [Extensions](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/models.md) · [Custom providers](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/custom-provider.md) · [Packages](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/packages.md) · [Themes](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/themes.md)
