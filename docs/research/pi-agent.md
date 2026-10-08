# 🦐 Pi Coding Agent

Date: 2026-06-11
Updated: 2026-10-02

Pi is Shrimpy's embedded agent and session engine. Shrimpy pins the registry-published `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` packages rather than depending on a local checkout or active fork.

This note describes the installed integration, the latest stable upgrade assessment, and a source and crash-recovery investigation of Pi's experimental durable runtime.

## Architectural Position

Shrimpy should give Pi ownership of the execution machinery it actually provides. In the installed coding-agent SDK, that includes the model/tool loop, provider dispatch, transcript mechanics, session tree, compaction, extensions, and terminal foundation. The separate durable runtime also owns persisted input admission, queues, task checkpoints, child ownership, cancellation, and committed observation. Building those mechanisms again above it would undermine the main reason to adopt it.

Shrimpy still owns an enduring agent's home and identity, actual execution authority, authenticated ingress, recurring wakeups, channel delivery, and process supervision. Ordinary coding-agent extensions can own timers, watchers, and sockets, provided their lifecycle is handled; the real constraint is whether that service should follow one session or survive independently. Durable extensions use a different API and have no service startup/shutdown contract. The [durable investigation](#pi-durable-source-and-recovery-investigation) explains the distinction. Choosing that runtime would replace the present integration, rather than adding another execution layer above it.

## Current Shrimpy Integration

- Shrimpy pins all four Pi packages at `0.84.4`.
- Shrimpy requires Node `>=22.19.0`, matching Pi's runtime requirement.
- Pi-facing tool schemas use `typebox` `1.3.7`, aligned with the installed Pi `0.84.4`. Shrimpy-owned configuration schemas remain on `@sinclair/typebox` `0.34.41` because those types never cross the Pi tool boundary.
- The main host boundary uses `createAgentSession()`, `createAgentSessionRuntime()`, `SessionManager`, `SettingsManager`, and `DefaultResourceLoader`.
- `SessionBootstrap` constructs one canonical `ModelRuntime` with workspace-local auth, custom-model, and dynamic-catalog paths and passes it through session creation and replacement.
- Shrimpy extensions register tools, commands, headers, footers, custom UI, message renderers, lifecycle hooks, model-switch rendering, activity state, turn context, session leases, and compaction interception through public extension APIs.
- Resource-loader overrides let Shrimpy own prompt assembly and visible skill selection while Pi retains native tool definitions, provider calls, transcript mechanics, and the interactive runtime.
- Pi's session replacement lifecycle powers Shrimpy's cross-agent and cross-session navigator.
- Normal `npm test` does not typecheck `extensions/*.ts`; Pi upgrades need a separate extension typecheck.
- `ToolRenderContext` remains internal. Shrimpy compact-tool renderers use local structural typing rather than importing a private type.

Each Shrimpy session gives Pi a workspace-backed `SettingsManager`. Native `/settings` changes are durable: shared Pi interaction preferences live under `pi.settings`, Shrimpy-owned runtime values keep their `runtime` fields, and Ctrl+S in `/thinking` saves the active agent's `agents[].thinking` default. User-global and project-local Pi settings remain outside the host boundary, and Shrimpy continues to pass a fixed set of bundled extensions and explicit skill paths rather than consuming normal Pi packages.

## Latest Stable Pi

The latest stable release inspected on 2026-10-02 is **`v1.0.0`**, released 2026-10-01, at `a13d35a742c6ef8462812a28fbe1d8c8b7431c32`. All four packages installed successfully from the registry at exact `1.0.0` in a disposable Shrimpy copy. Shrimpy itself remains pinned to `0.84.4`.

The local reference clone at `/Users/zachmeador/gits/pi-mono` was fetched and fast-forwarded to upstream `main` at `69f0be6f0`. Analysis and candidate packages use the stable tag; the clone also contains unreleased changes. Ten releases follow the installed version: `0.85.0`, `0.85.1`, `0.86.0`, `0.86.1`, `0.87.0`, `0.87.1`, `0.99.0`, `0.99.1`, `0.99.2`, and `1.0.0`.

A later fresh clone for the durable investigation lives at `/Users/zachmeador/gits/_clones_of_other_projects/pi`, pinned to `main` commit `a276dabe57911253350bffb93cb7d7aff6a73261`. The durable, Chord, protocol, client, server, and coding-agent experimental runtime source trees are identical to `v1.0.0` at this revision; only empty unreleased changelog headings differ in four of those packages. The source probes below therefore exercise released durable code alongside the inspected current `pi-ai` source.

## What Is Most Useful Now

### Native MCP and code-based tool orchestration

Pi `0.99.0` added built-in extensions for MCP, `codemode`, and `tool_search`. Codemode runs model-written JavaScript in QuickJS, calls existing tools in parallel, and returns selected output. It supports structured tool results, namespaces, tool search, nested tool events, and small branch-persistent `store()` values. Pi `1.0.0` shortens its declarations and adds image generation. This is a useful execution pattern for research, inspection, and combining many small tools; Shrimpy need not build its own script orchestrator. [Codemode](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/codemode.md).

MCP supports stdio and streamable HTTP, OAuth, extension registrations, resources, configurable exposure, and deferred discovery. Servers without direct tools connect in the background rather than delaying the first prompt. Pi `1.0.0` fixes deferred-tool restoration after resume/reload and strengthens OAuth server identity and scope handling. [MCP](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/mcp.md).

These features are **not automatically enabled by upgrading Shrimpy**. The SDK exports `createMcpExtension()`, `createCodemodeExtension()`, and `createToolSearchExtension()`; the CLI installs built-ins, while SDK hosts supply the factories. Shrimpy's `src/sessions/pi-resources.ts` currently supplies its own factories, and `src/config/pi.ts` reserves `defaultTools`, packages, and resource paths to Shrimpy policy. MCP configuration and credentials need an explicit workspace owner before exposing `/mcp` or its tools.

QuickJS limits the script's direct capabilities. Calls to Bash, MCP servers, and other tools still use those tools' authority. Codemode is not containment of the Pi process or tools, and successful script rollback of its small store does not undo external tool effects.

### Canonical context and actionable turn boundaries

Pi `0.86.0` records changing system prompts and tool declarations in transcript system messages. Pi `0.87.0` makes `SessionManager` the canonical source of future request context and adds append-only `context_edit` entries. A context edit can omit or replace a message for the model while retaining the raw transcript for inspection. This is a strong foundation for reducing stale context without maintaining a competing message store. [Session format](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/session-format.md).

Actionable `turn_end` and `agent_before_settle` hooks can append structural entries and request one further provider call. They expose projected context, pending input, and outcome; Pi retains queue scheduling. `context` handlers now receive conversation messages without system messages; `context_with_system` provides the explicit full-transcript transformation boundary. `pi.on()` returns an unsubscribe function. [Extension events](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/extensions.md).

For Shrimpy, these changes overlap `src/sessions/turn-context.ts`, context inspection, transcript cloning, compaction, and `src/sessions/turn-output.ts`. The last still resolves on the first `agent_end` and rejects cancellation without forwarding it to `session.abort()`. Prefer Pi's prompt/settlement lifecycle; the new hooks make a second Shrimpy turn-completion engine less necessary, not more.

The public `message_end` hook remains useful for capturing context when queued input is actually consumed. An offline probe against `1.0.0` verified different context versions for initial and queued inputs, agreement between provider input and live/reopened transcripts, and final settlement of the original prompt. That does not prove every steering, compaction, or retry path.

### Durable runtime and client/server packages

Pi `1.0.0` moves the experimental harness out of agent-core into **`@earendil-works/pi-durable`**. It has a materially different contract from coding-agent's `AgentSession`: committed conversations, documents, submissions, and task checkpoints, with SQLite, JSONL, and memory storage. Inputs can have durable `requestId` deduplication; work can resume after reopening storage. Configuration is resolved per conversation and extensions are installed in a host-owned registry. [Durable runtime](https://github.com/earendil-works/pi/blob/v1.0.0/packages/durable/README.md).

Tool intent is committed before execution. An interrupted tool reruns only when both its saved intent and current implementation declare replay safe; otherwise the model receives an interrupted result with retained committed output. The [source and recovery investigation](#pi-durable-source-and-recovery-investigation) includes actual process kills, external-effect duplication, Bash survival after owner death, waiter cancellation, and storage-ownership probes. These distinguish persisted runtime state from effects outside its database.

The same release contains separately published **`pi-server`, `pi-client`, and `pi-protocol`**. The server routes application-owned services to durable session workers; clients attach to presentations, receive snapshots/subscriptions, and carry attachment IDs that reject stale routes. Disconnect rejects local waits without implying that admitted remote work was canceled. The client does not automatically reconnect or replay requests. The protocol uses bounded framed CBOR with opaque strict-JSON service payloads; Chord supplies typed service semantics. [Server](https://github.com/earendil-works/pi/blob/v1.0.0/packages/server/README.md), [client](https://github.com/earendil-works/pi/blob/v1.0.0/packages/client/README.md), [protocol](https://github.com/earendil-works/pi/blob/v1.0.0/packages/protocol/README.md).

**These are experimental foundations, even though their package version is `1.0.0`.** Durable warns that its API can change without notice; the protocol promises no compatibility. Peer authentication remains application policy and is not implemented by the experimental Unix transport. Session discovery, management contracts, worker ownership, supervision, and application authorization remain host responsibilities. Coding-agent's experimental client/plugin subpaths have source-only conditions; they are not a supported published remote coding-agent API.

This is the most consequential architectural research opportunity: compare the durable harness and routing libraries with Shrimpy's session pool, leases, channel admission, worker supervision, and client attachment before rebuilding those mechanisms. Adoption would change the transcript, extension, environment, and UI integration contracts. It is a separate decision from updating the four installed coding-agent packages, not a drop-in replacement or an implemented mesh.

### Model routing, classifiers, and images

Experimental virtual models let an extension choose a physical model and thinking level for each request. Selection and dispatch are recorded separately; routing state follows the session branch, and Pi checks compaction against the physical model's limits. This could replace a bespoke router for choosing cheap or capable models. Shrimpy's configured model policies currently choose concrete models; they do not implement this per-request routing mechanism. [Virtual models](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/virtual-models.md).

The unified model runtime now supports chat, image, and classifier models. `classify()` exposes typed choice, score, and boolean answers through Jev providers and llama.cpp next-token probabilities; `generateImages()` uses the session's credential resolution. These are candidates for context selection and inexpensive decision gates, and for generating artifacts through tools. Local quality, latency, and routing cost have not been measured. Unqualified model reads remain chat-only, so Shrimpy's existing selectors need not suddenly accept image models. [Models](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/models.md).

### Cache, compaction, and terminal improvements

Cost-aware prompt-cache warming can keep eligible caches alive during long tool runs; the default is `streaming`, and optional `idle` warming runs between turns. It requires model lifetime metadata and an estimated avoided miss cost of at least $0.05. Warming costs count toward usage and can be controlled by `cache_warming_decision`. This is a new operational behavior to choose explicitly for long-lived agents. [Settings](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/settings.md).

Per-model compaction budgets, better cancellation/retry handling, overflow detection, signed-thinking replay, image limits, and earlier transcript persistence improve ordinary resident work. Shrimpy's copied compaction runner should be compared with these changes. The `session_before_compact` result still only cancels or replaces compaction; it does not add an instruction-only augmentation field, so the existing copy cannot simply be deleted on that basis.

Pi now defaults to fullscreen, adds a terminal-derived system theme, embeds progress spinners in the editor, improves clipboard/file paste and autocomplete, and reduces rendering CPU/memory. These changes affect Shrimpy's theme deep imports, model selector patches, compact renderers, custom footer, and activity indicator. Set `tuiMode: "regular"` explicitly if retaining regular scrollback is the desired host behavior.

## `1.0.0` Upgrade Assessment

### Summary and versions

Decision, 2026-10-02: Shrimpy skips this upgrade. `main` stays on `0.84.4` while Shrimpy is rebuilt on `pi-durable` per the [replacement plan](../REDESIGN/PLAN.md). The assessment below is kept as evidence.

The stable upgrade is worth pursuing, but **it is not ready to land unchanged**. Source build failures and context-inspection regressions are demonstrated. Small disposable edits let the host build and start, but those edits are diagnostic accommodations, not a validated implementation.

- Shrimpy source: clean `main`, `574bb2cb525e2fddabda7382c510ce048efd5b25`, `/Users/zachmeador/gits/shrimpy`.
- Current four Pi packages: exact `0.84.4`; target: exact registry `1.0.0`, tag `a13d35a742c6ef8462812a28fbe1d8c8b7431c32`.
- Current Pi-facing TypeBox: `1.3.7`; target Pi installs `1.3.27`. The probe retained both; alignment deserves verification. Shrimpy-owned `@sinclair/typebox` remains a separate boundary.
- Node requirement remains `>=22.19.0`; probes used Node `26.7.0`, npm `11.19.0`. Pi's own source build now uses TypeScript 7/ES2024; that does not itself require switching Shrimpy's compiler.

### Release impact map

All four changelogs were read from after `0.84.4` through `1.0.0`. The map groups repeated entries by affected surface; provider-specific fixes are grouped where Shrimpy delegates their implementation to Pi. Evidence uses the stable source diff and published-package probes, not unreleased code.

| Upstream change | Shrimpy surface and evidence | Assessment |
|---|---|---|
| `0.85.0`: restore externally stored entries with `SessionManager.inMemory()` | `src/sessions/context-inspection.ts` currently flattens projected messages into a fresh manager; stable session-manager implementation inspected | Candidate to preserve entry IDs, edits, and compaction state in inspection clones instead of flattening them. Not exercised here. |
| `0.85.0`: tool cwd correction; fork/import/compaction-boundary fixes | `src/sessions/open.ts`, `transcript-store.ts`, `pool.ts`; sessions/runtime probes | Useful native fixes; archive metadata and leases remain Shrimpy-owned. Filesystem authority still needs host policy. |
| `0.85.0–0.86.0`: embedded loader, status spinners, clipboard, search/autocomplete | `extensions/activity-indicator.ts`, `src/tui/model-selection.ts`, `session-selector.ts`; loader/TUI diff and startup | Activity extension compiles; fullscreen startup and selectors smoke-tested. Clipboard, image paste, custom editor, and configurable save keys not exercised. |
| `0.85.0`: pi-tui environment defaults removed | Shrimpy normally uses Pi `InteractiveMode`; source search found no removed color-query API calls | Explicit renderer settings matter for standalone widgets. No current imported API blocker found. |
| `0.85.0–1.0.0`: provider models, OAuth, effort/signature replay, strict schema, retry/cost/cache fixes | `src/setup/model-access.ts`, `src/sessions/models.ts`, `src/inference/quick-call.ts`, `src/tools/daemon.ts`; pi-ai changelog/source and offline fixtures | Shrimpy delegates adapters to Pi. Credential-backed providers, local Qwen, OAuth callbacks, subscription limits, and image requests remain unverified. No automatic credential migration is proposed. |
| `0.85.0`: AI binding fetch rename and compact assistant frames | Source search found no Cloudflare binding helper or frame encoder imports | No direct breakage; frames could support a future stream transport. |
| `0.85.1`: experimental client code removed from supported SDK packaging | Shrimpy imports the supported package root; package exports inspected | Do not treat source-only client/plugin conditions as a supported remote API. Separately published server/client libraries are assessed above. |
| `0.86.0`: `TranscriptContext`; JSON-only tool arguments/details | `src/sessions/context-inspection.ts`, `quick-call.ts`, compaction runner and provider fixtures; compile and inspection probes | Caller-side `Context` remains supported, provider callbacks now receive transcript context. Inspection loses separate prompt/tools; test fixtures need normalization-aware assertions. Tools must return JSON-compatible details. |
| `0.86.0`: persisted prompt/tool changes and forced prompt behavior | `src/context/contained-system-prompt.ts`, `src/sessions/open.ts`, `pi-resources.ts`, `turn-context.ts`; session tests | Provider input now includes a system message; old assumptions about top-level `systemPrompt` and user-only message arrays fail. Preserve containment and inspect normalized provider input. |
| `0.86.0`: compaction overrides, cancellation, oversized results, retry delay cap | `src/sessions/compaction/{extension,runner,policy}.ts`, `src/config/runtime.ts`; compaction tests and upstream compaction diff | Existing focused compaction tests pass with diagnostic build fixes. Copied runner may bypass newer projection and per-model budget behavior; default behavior parity not established. |
| `0.86.0`: cache warming and decision event | Session settings adapter passes native preferences; SDK constructs `CacheWarmer`; stable settings/source inspected | New model calls/cost behavior, default `streaming`. Choose policy explicitly; not benchmarked or exercised. |
| `0.86.0`: `/bug`, diagnostics, handler unsubscribe, RPC input hooks | `src/tui/inline-commands.ts`, resource loader, terminal host; slash catalog diff and command-conflict probe | `/bug` is the only new core slash catalog name. No collision with Shrimpy `/agents`, `/status`, `/shrimpy`; decide how its report/export flow fits host data policy. RPC input interception now applies to steering/follow-up. |
| `0.87.0`: canonical `SessionManager`, `context_edit`, `context_with_system` | Context inspection, transcript readers, turn-context normalizer and compaction; stable projection code and offline context probe | Assigning agent messages no longer controls future history. Use restore/projection/refresh APIs; retain raw versus effective context separately. Added union members require checking exhaustive switches and constructed events. |
| `0.87.0`: `prepareRequest`, `finishTurn`, actionable boundaries, deferred settled actions | `src/sessions/turn-output.ts`, `recording.ts`, channel runtime; source search and queued settlement probe | No `shouldStopAfterTurn` usage found. Replace early completion wrapper through public Pi lifecycle; new boundaries provide policy hooks without replacing queue scheduling. |
| `0.87.0`: image resize profiles | `src/skills` resource loading, media tools, provider/model configuration; changelog and model types | Native image preprocessing is reusable. Attachment limits and image cache behavior not exercised. |
| `0.99.0–1.0.0`: MCP/codemode/tool search, exposure and nested execution | `src/sessions/pi-resources.ts`, `src/config/pi.ts`, `src/tools/daemon.ts`; exported factories, SDK/loader source, absence of local implementation | Host must opt in and own configuration. Native orchestration is a deletion candidate for any proposed custom executor; SDK upgrade alone does not install built-ins. New default-tool modifiers must not bypass Shrimpy allowlists. |
| `0.99.0–1.0.0`: virtual/chat/image/classifier model runtime | Concrete model policy, quick calls, setup selectors, custom footer; unified types and virtual-model docs | No removed plural image-model imports found. Per-request routing and structured classification are new extension options; custom footer lacks upstream routed-model display. |
| `0.99.0`: input admission dispositions | `src/sessions/turn-output.ts`, external input adapters; `prompt`, RPC and `RpcClient` implementations | SDK `prompt()` still returns `Promise<void>` and reports `handled/queued/started` via `preflightResult`; `steer()`/`followUp()` return queued-input disposition. Admission is not completion. |
| `0.99.0–1.0.0`: theme/color redesign, fullscreen default, `quietStartup: "header"` | `src/app/pi-internals.ts`, `src/tui/interactive.ts`, `src/config/runtime.ts`, settings storage | Unchanged build fails for removed `detectTerminalBackgroundFromEnv` and widened `quietStartup`. Remaining private theme helpers still lack root exports. New fullscreen mode reaches the prompt. |
| `1.0.0`: experimental harness removed from agent-core; durable/server/client/protocol packages | Source search found no old harness imports; published package imports and SQLite reopen probe | No direct removed-harness blocker. New foundations warrant separate architectural evaluation; no transport or crash-in-flight proof. |
| Continuing gaps: collapsed custom-message spacer, built-in interception, selector decoration | Stable `CustomMessageComponent` and root exports; current turn-context and selector tests | Spacer remains and Shrimpy's patch still passes. Existing inline command/model-selector patches are not superseded by public APIs. |

### Confirmed blockers and required changes

The unchanged candidate build fails at three places:

1. `src/app/pi-internals.ts`: `detectTerminalBackgroundFromEnv` no longer exists. Stable Pi has `detectTerminalTheme()` and terminal palette state; adapt the host initialization without claiming the environment-only fallback reproduces palette detection.
2. `src/sessions/open.ts:282`: assignment to `session.state.systemPrompt` fails because it is read-only. Move initialization to supported prompt/resource hooks and validate pre-request inspection as well as actual provider context.
3. `src/sessions/settings.ts:100`: `quietStartup` now has type `boolean | "header"`, while Shrimpy runtime configuration allows only boolean. Choose and persist the supported host values coherently; a cast would hide the mismatch.

There is also a demonstrated runtime regression: `src/sessions/context-inspection.ts:226` copies top-level `context.systemPrompt` and `context.tools`. With normalized provider context both are absent, so it reports `""` and `[]` even while transcript system messages contain the prompt and tools. Read effective state with Pi's `getCurrentSystemPrompt()` and `getCurrentTools()` and define whether inspected messages include system entries. The existing parity test can compare two empty fields and miss this; in the probe it instead fails on a time difference embedded in system-message content.

`test/sessions.test.ts` also assumes a separate provider `systemPrompt` and one user message. Two focused tests fail because context now has transcript system messages. Update their assertions to test preserved behavior rather than merely changing counts. Do not mistake these stale fixtures for proof that containment or turn-context persistence is broken.

### Verification and limits

Disposable candidate: clean Git archive of the Shrimpy baseline under `/tmp/shrimpy-pi100-x9w6qee6/shrimpy`. Live workspace data and credentials were not copied. All install/build/TUI writes happened there or in disposable fixture homes.

- Exact four-package `1.0.0` installation: passed. `npm ls` confirmed Pi uses TypeBox `1.3.27` while Shrimpy's direct `1.3.7` remains.
- Unchanged `npm run build`: failed with the three TypeScript errors above.
- Independent strict extension typecheck: passed using `tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --skipLibCheck --allowImportingTsExtensions extensions/*.ts`.
- Diagnostic edits only in the candidate: substitute an environment fallback using `detectTerminalTheme()`, omit the forbidden state assignment, and collapse header quiet startup to boolean. With those accommodations, `npm run build` passed, including web output and generated mirrors. These edits are not offered as the upgrade patch.
- Focused resources, context parity, runtime replacement, settings, themes, and collapsed-context slice: 11/12 passed. Parity failed because separate captures have different runtime timestamps inside new system messages. A separate assertion probe confirmed empty top-level inspection prompt/tools alongside transcript system entries.
- Focused compaction, quick-call, models, sessions, compact-tool renderers, inline commands, and model-selection slice: 58/60 passed. Two session tests fail on old provider-context shape assumptions; compaction and rendering checks pass within their existing coverage.
- Offline queued-context/lifecycle probe: passed against `1.0.0`; source was the checkpointed redesign probe on branch `REDESIGN`. No model network request was made.
- Real Shrimpy terminal construction in a PTY, using the candidate's `prepareAgentTuiSession()` exposed only for the probe: reached fullscreen prompt with startup diagnostics `[]` and no extension conflict block. `/settings` opened the native menu, `/new` reported a new session, `/model` opened its empty configured-provider selector, and `/quit` exited cleanly. No credential-backed model was selected; configurable save shortcuts, theme palette response, persisted new preferences, image/clipboard behavior, and streaming UI remain unverified.
- Published `pi-durable`, `pi-server`, `pi-client`, and `pi-protocol` imports: passed. The initial SQLite probe preserved root identity and instructions through close/reopen. The later [durable investigation](#pi-durable-source-and-recovery-investigation) records stronger, separately scoped source and process-death evidence.
- Full test suite and lint were not run: the demonstrated build/inspection blockers already prevent an unchanged upgrade from being ready. The terminal smoke and targeted tests do not override them.

### Upgrade sequence

1. Fix the three compile blockers and normalized context inspection in an isolated candidate; align Pi-facing TypeBox deliberately and keep ambient resource/configuration inputs explicit.
2. Verify containment and context through real provider-input capture, raw/effective transcript projection, compaction, reload, branch/resume, queued input, cancellation, and the prompt settlement lifecycle. Use upstream APIs to remove duplicate completion/context machinery where the behavior is proved.
3. Exercise every changed host interaction: fullscreen/regular mode, theme detection, selectors and save shortcuts, settings persistence across process restart, tool output, clipboard/images, authentication, and extension diagnostics. Run the build, extension typecheck, focused checks, lint, and full suite.
4. Smoke-test the actual credential-backed providers and local endpoints, including thinking replay, overflow, cache warming policy, and interrupted streaming. Only then decide whether the ordinary coding-agent upgrade is ready to land.
5. Evaluate native MCP/codemode and the experimental durable/client/server foundations as separate capabilities, using disposable data and explicit application authority. Compare a real persisted tool turn, detach/reconnect, and process death before choosing a new hosting contract.

The previous `0.84.4` integration was completed for Shrimpy `v0.6.2`: native `/thinking` and settings persistence, command-conflict checks, build/lint, and 738 automated tests passed, with credential-backed smokes still absent. Those historical results do not validate `1.0.0`.

### Unreleased upstream watch

Upstream `main` at `a276dabe57911253350bffb93cb7d7aff6a73261` is beyond the stable tag. Its changelogs include OAuth URL copying, MCP Client ID Metadata Documents, per-project overrides of global MCP servers, additional classifiers, removal of the published shrinkwrap, a `brace-expansion` dependency advisory fix, codemode output limits, extension image-rendering fixes, and provider/terminal corrections. These remain an upgrade watchlist; the durable probes do not validate these unrelated changes. The packaging fix is relevant to library consumers who need dependency overrides. [Unreleased coding-agent changes](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/CHANGELOG.md).

## Pi Durable Source and Recovery Investigation

### What the runtime owns

`pi-durable` is a different agent engine, built directly on `pi-ai` and Chord. It does not embed coding-agent's `AgentSession` or implement its `ExtensionAPI`. Its package remains explicitly experimental, including at version `1.0.0`.

One **Harness** owns one open storage and the scheduler operating on it. A **conversation** is an independent model context with an immutable transcript and selected agent configuration. That configuration is called an “agent” in Pi, but it is not an enduring Shrimpy identity, credential authority, or isolated process. Many conversations can share one Harness and its host-supplied model runtime and environments.

The storage contains three useful kinds of records:

- Transcript entries: user input, system/tool declarations, assistant responses, tool results, resets, and compaction boundaries.
- Typed mutable documents: configuration (`pi.agent`), active work and progress (`pi.live`), queued input (`pi.inbox`), usage (`pi.usage`), and application-defined state. Documents can be session-, conversation-, or task-scoped, with explicit history and fork behavior.
- Durable tasks and submissions: task inputs, phases, checkpoints, ownership, memos, outcomes, and input admission/settlement records.

All changes pass through one serialized transaction line. A commit can append entries, edit documents, create children, and change task state together. Observers receive the change after storage accepts it. A failed uncertain storage write poisons the open Session; only `StorageRejected`, which promises no batch effects, allows continuing on the same instance. Commit callbacks must keep external effects outside the transaction. [Session kernel](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/session/session.ts), [data definitions](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/types.ts).

### One input, through a crash

```text
commit input + submission + generation task
  commit request model/options + transcript cutoff
  call provider
  commit assistant tool calls + owned tool tasks
    commit final tool arguments + replay policy
    perform tool effect outside storage
    commit tool result + task outcome
  call provider again
  commit final answer + submission settlement
```

The unit of completion is the **submission**, not a model response or one generation task. A tool round or `onYield` hook can create another generation while retaining the same input IDs. An interrupted tool may produce an error result while the enclosing submission eventually receives a successful final answer.

`submit()` returns after durable admission. A `requestId` deduplicates within its conversation across reopen. The first submission wins: the implementation checks the submission type, but does not compare a repeated ID's content. Reusing an ID with different input returns the original submission. Adapters therefore need a stable source-event ID and deliberate retry semantics. `Submission.wait()` observes settlement; cancelling that wait leaves the admitted work running. `Submission.abort()` withdraws queued input; already placed work needs conversation/task abort. [Admission](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/harness/submissions.ts).

Opening storage reconciles surviving `running` tasks to `pending` while retaining checkpoints and memos. `resume()`, submitting, or waiting enables execution. It re-enters the saved phase with installed code; it does not restore a JavaScript stack or a shell process.

| Interrupted point | Recovery behavior |
|---|---|
| Model request, before an answer | Resend using the stored model, thinking level, stream options, and transcript cutoff. Current `beforeRequest` hooks run again. |
| Model stream, after committed partial text | Preserve the partial as an aborted assistant entry, then send the request again. No token-level continuation. |
| Tool, after committed intent | Rerun only if saved policy and current selected implementation both say `safe`. Otherwise append an interrupted error result with committed output/details. |
| Tool result already committed | Continue the next phase; the completed call is not repeated by that task. |
| Graceful Harness close | Signal and join active handlers without recording user cancellation; reopen can resume work. |
| Explicit conversation/task abort | Commit cancellation marks, withdraw queued input, and abort owned foreground descendants before parent cleanup. |

The built-in read, write, edit, and Bash tools do not opt into safe replay; the default is unsafe. For custom safe tools, replay skips `beforeTool` and argument validation and uses the stored final arguments with the current implementation and current conversation environment. Changing code, schema, cwd, or target resources between attempts changes what “safe” must mean. [Tool execution](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/harness/tool.ts), [generation](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/harness/generation.ts).

### External effects and execution authority

A tool effect and its database result cannot generally share an atomic commit. A crash after the effect and before the result leaves uncertainty. `replay: "safe"` is an implementation promise, not exactly-once execution. The process-kill probe executed a declared-safe tool twice and wrote its external journal twice. A second version used the stable `api.taskId` as an idempotency key: two attempts then produced one effect. Pi's own recovery tests use the same pattern with an idempotent external service.

The default Node environment uses ordinary filesystem access and launches detached shell process groups. `cwd` chooses a working directory; it does not bound filesystem access. Trusted extension code can call Node directly and bypass the environment interface. A host-supplied `ExecutionEnv` lets built-in and cooperating tools route access through a constrained environment, but actual isolation requires enforcing the intended authority outside that trusted interface.

An actual Bash probe printed `started`, persisted its output, and then lost its Pi owner to SIGKILL. Recovery recorded an interrupted result and finished the submission. The original detached shell still completed a delayed file write. Recovery of database state does not imply that old execution has stopped. Process groups, containers, or another supervisor must supply that guarantee when required. Normal abort/cleanup can kill child groups; SIGKILL prevents that JavaScript cleanup from running. [Node environment](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/env/node.ts).

Close and abort also rely on cooperative handlers. The scheduler waits for them without a shutdown timeout. An extension that ignores its cancellation signal can prevent graceful close or abort from finishing.

### Ownership, extension code, and observation

Tasks own tasks or conversations. Ordinary child work keeps its parent busy; a parent whose handler returned remains `completing` until descendants finish. Failure and abort propagate down foreground ownership, and cleanup runs from children toward parents. A background task creates an explicit boundary: it survives the parent's ordinary abort and does not delay parent idleness. Explicit background-inclusive abort crosses that boundary. This is useful local lifetime control, not a distributed peer-work coordination system. [Scheduler](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/harness/scheduler.ts).

Durable extensions bundle tools, prompt sections, task definitions, hooks, and wrappers. The registry holds executable code; configuration stores names. There is no `session_start`, initialization, or disposal hook in this extension API. Service startup and shutdown belong to the host. Running tool phases retain their captured implementation; later work resolves the registry again. After process restart, code must be installed anew. Removed extension names silently disappear from tool/section selection, while missing or incompatible task definitions block task dispatch and appear in inspection. Tasks support versioned checkpoint migration; old running code can survive an incompatible replacement only while that process remains alive. [Registry](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/src/harness/registry.ts), [registry lifecycle tests](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/test/harness-registry.test.ts).

Coding-agent also has experimental Chord plugins for UI and session service facets. Those have activation/disposal and service reload, but do not install durable tools into the registry. They form a third contract alongside ordinary `ExtensionAPI` extensions and durable extensions. A remote presentation may need these service facets; the agent's reasoning capabilities do not need an extra plugin layer just to use durable tools. [Experimental plugin exports](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/src/experimental/plugin.ts), [worker service composition](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/src/experimental/services/worker.ts).

Conversation views combine the transcript with committed documents. Watches attach with a snapshot and ordered updates; slow consumers receive a new snapshot after more than 100 queued frames. Agent events are derived from those commits. Streaming and tool progress are throttled, typically to at most one commit per 100 ms, so only the committed portion survives abrupt death. UI clients can render that state without owning execution or maintaining a second authoritative activity store.

### Storage guarantees

SQLite uses WAL and `synchronous = NORMAL`. Its intended guarantee covers ordinary process crashes; the latest acknowledged commits may be lost on power or host failure. The default Node adapter exposes WAL checkpoint and busy-timeout options, not a selectable synchronous mode.

JSONL appends sidecars before a main commit marker and publishes after that append. Recovery discards torn final lines and unconfirmed sidecar tails; missing confirmed data is corruption. With `fsync: true`, ordinary commits flush sidecars before appending the marker, but **do not flush the main marker before acknowledgment**. Main-only commits perform no flush. The marker is flushed before destructive reclamation. This behavior is intentional in the normative specification: an acknowledged tail commit may still disappear. The filesystem spy probe confirmed the exact flush order; it was not a power-failure experiment. [JSONL specification](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/durable/docs/spec.md#113-jsonl).

One process must own a storage. The core does not lock or fence owners. A disposable test opened two SQLite Harnesses against the same database successfully; after one committed, the other allocated an already-used ID and its Session became poisoned. SQLite's file-write locking does not establish Harness ownership. Coding-agent's experimental local host supplies its own session-file lock, illustrating the appropriate layer for that responsibility.

### Client attachment and admission retries

`pi-server` and `pi-client` route typed Chord service calls; the application supplies the runtime behind them. Coding-agent's experimental session-worker services directly wrap a durable Harness, making that code useful prior art. Attachment IDs reject requests through stale routes. Cancelling a remote wait cancels the waiter; disconnecting releases the attachment and subscriptions without closing the underlying runtime. Reconnect is explicit and needs a new attachment. These semantics were exercised with actual client/server implementations over an in-memory byte transport.

The experimental controller has a material admission gap: its prompt request has no application `requestId`, and it does not pass one to `Conversation.submit()`. Protocol RPC IDs do not supply durable input deduplication. The probe dropped the successful admission response, let the admitted work finish, reconnected, and retried the same input. It received a new submission ID and produced two user entries. A Shrimpy admission service would need to carry the source-event ID through to the durable core and preserve conversation selection across retries. Authentication and authorization also remain application responsibilities. [Controller request](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/src/experimental/services/agent-controller.ts), [controller implementation](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/src/experimental/services/agent-controller-provider.ts).

### Executable evidence

The fresh source clone is clean. Investigation data and dependencies live under `/private/tmp/pi-durable-latest-8dXvwe8u/`; the disposable source copy came from `git archive` of the pinned clone. Dependencies were installed with `npm ci --ignore-scripts`. Node was `26.7.0`. Shrimpy's existing research edits were preserved; its package files, source, live `dist/`, workspace, and credentials were not changed.

- Eleven selected upstream test files passed: **278 tests**, covering admission, queues, lifecycle, ownership, task/generation/tool recovery, registry changes, SQLite, JSONL, and storage/runtime boundaries. The tests ran against current source and freshly emitted current `pi-ai` core code. Initial source execution needed that emission because `pi-ai` exports reference `dist`; its whole-package typecheck reported missing generated provider catalogs. This was not a successful full-monorepo build.
- Six actual SQLite process-kill scenarios passed: admitted input, unsafe external effect, declared-safe duplicate effect, task-ID-deduplicated effect, persisted partial model stream, and surviving Bash child. Each recovery used a new Node process, fresh fixture provider/registry, the same database, and no live credentials. All six also checked that retrying the admission ID returned one original input even with changed retry content.
- A separate cancelled-wait probe passed: the waiter rejected while the submission stayed placed, then a reacquired submission returned its final answer.
- The JSONL filesystem-spy and two-owner SQLite probes passed their assertions, confirming the limitations above.
- Three remote-service scenarios passed using real `pi-server`, `pi-client`, the experimental session-worker services, and a durable memory Harness: cancelled wait, disconnect/reconnect/reattach with stale-route rejection, and duplicate admission after a deliberately lost reply. The byte transport and worker lifetime were supplied in process; this did not exercise Unix sockets, worker subprocess supervision, authentication, or SQLite over that transport.

The retained scripts are `pi/crash-probe.mjs`, `pi/crash-worker.mjs`, `pi/wait-probe.mjs`, `pi/fsync-probe.mjs`, and `pi/remote-durable-probe.mjs` under the disposable directory. `crash-results.json` records transcripts, task IDs, external journals, and checkpoints; `remote-durable-results.json`, `tests.log`, `crash.log`, and `wait.log` record outcomes. The crash coordinator preloads Pi's `packages/coding-agent/src/experimental/source-resolver.ts` in each child, so those process probes resolve workspace packages directly to current source.

These tests use the faux provider and real filesystem/SQLite/processes. They do not validate real-provider reconnects, provider-owned deferred handles after process death, power failure, OS containment, authenticated remote transport, or Shrimpy's proposed full workflow.

### Consequences for a simpler Shrimpy

The largest deletion opportunity is the inner runtime: custom admission records, turn-completion wrappers, in-memory input queues, transcript/progress projections, local task trees, and cancellation/recovery machinery can become Pi-owned. Application state that must change atomically with an input or task can be a typed document instead of a second journal.

Shrimpy capabilities that shape reasoning can become small durable extensions: identity/context prompt sections, home/memory tools, policy hooks, and subagent recipes. Existing coding-agent extensions cannot be loaded unchanged. Its native MCP/codemode factories, slash commands, selectors, renderers, resource loader, and package manager belong to the other API; reuse requires an explicit adapter or a replacement, and is not established by these probes. The engines under the MCP and codemode factories are separate packages: `@earendil-works/pi-codemode` and `@earendil-works/pi-mcp` are published at `1.0.0` with no Pi dependencies (only `quickjs-wasi` and `cross-spawn` respectively), so a durable extension can wrap them. The coding-agent glue for tool search, namespaces, the `models` global, and store persistence would need porting. Upstream's experimental durable coding-agent reuses model/auth/settings/TUI components but explicitly omits the regular extension ecosystem, prompt templates, images, login UI, and tree navigation.

A minimal host still selects the enduring agent home, creates the model/credential runtime and trusted registry, supplies the execution environment, owns one storage exclusively, and supervises that execution. Ordinary adapters own authenticated external messages, conversation selection, delivery retries, and recurring wakeups. They submit input and observe durable settlement, rather than calling into a Shrimpy-owned model loop. CLI and UI clients operate on the same runtime state.

This supports evaluating a replacement based on `pi-durable`, not another compatibility layer around the present session pool. The unresolved product tradeoff is whether those runtime deletions outweigh the missing coding-agent UI/extension capabilities. The experimental host is useful prior art for answering that, not a finished Shrimpy foundation. [Experimental durable host](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/src/experimental/durable/README.md).

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
- `src/tui/turn-context-rendering.ts` patches `CustomMessageComponent.prototype` because a renderer with no collapsed content still leaves a reserved spacer.
- `src/app/pi-internals.ts` deep-imports theme registry, proxy, and automatic-theme helpers outside Pi's public export contract.
- `src/sessions/open.ts` assigns `session.state.systemPrompt` after creation. The public per-turn containment hook remains authoritative, but a host setter or stronger initialization contract would be cleaner.
- `src/sessions/compaction/runner.ts` owns a copy-like compaction path because `session_before_compact` can replace or cancel compaction but cannot augment the default instructions.

These remaining terminal and compaction gaps justify narrow upstream API requests. The useful asks are built-in command interception, model-selector decoration, ephemeral transcript components, no-spacer collapsed renderers, exported theme preparation, and compaction-instruction augmentation. Public model-runtime calls and canonical session projection have improved upstream; compare those contracts before requesting equivalent host APIs.

## Pi Package Ecosystem

A Pi package is an npm package or git repository contributing `extensions/`, `skills/`, `prompts/`, or `themes/`. Pi can discover those resources by convention or explicit package metadata.

Shrimpy does not load the user's normal Pi package configuration. The workspace-backed settings adapter rejects Pi package and resource keys, while `createShrimpyResourceLoader()` uses fixed bundled extension paths, explicit Shrimpy skill paths, and disabled ambient skill discovery. This is a sound default for a durable home agent but leaves useful ecosystem work inaccessible.

If Shrimpy retains coding-agent, prefer its existing package discovery and management mechanisms with explicit agent-home configuration over inventing a second package manager. Shrimpy should own which trusted code and resources a home selects, their provenance, and the CLI access to that selection. Extensions execute with the host process's authority; instruction files and resource allowlists are not containment.

Native MCP/codemode factories can supply useful capabilities without first implementing general package installation. The durable path uses a separate registry API, so the runtime decision comes before designing a package bridge. Independent channel services, recurring wakeups, execution authority, and process supervision still need explicit owners; session/task execution should use the chosen Pi runtime.

## Relevant Pi Runtime Surfaces

### SDK And Sessions

Pi runs as an interactive CLI, print-mode CLI, JSON event stream, RPC subprocess, or embedded SDK. Sessions persist as JSONL trees with branching, forking, naming, navigation, and compaction.

Useful host objects include `createAgentSession()`, `SessionManager`, `SettingsManager`, `DefaultResourceLoader`, and `ModelRuntime`. The session exposes prompting, steering, queued follow-ups, subscriptions, aborts, compaction, model and thinking changes, tree navigation, active-tool control, reload, and disposal.

### Extension API

Extensions can register tools, commands, providers, renderers, shortcuts, flags, and UI components. They can persist custom session entries, inject user or system messages, inspect and activate tools, and intercept resource discovery, session lifecycle, model requests, agent turns, tool calls, input, compaction, and tree navigation.

Tool policy is composable through SDK allowlists and denylists, active-tool APIs, additive custom tools, and same-name tool replacement. Pi passes active tool schemas to providers and executes validated model calls.

### Prompt And Resources

`DefaultResourceLoader` controls system prompts, appended prompt text, instruction files, extensions, skills, prompts, and themes. Shrimpy supplies a complete assembled system prompt, strips ambient Pi instruction and skill layers, and loads a curated extension set. Pi continues to own provider-native tool definitions and interactive command handling.

The focused Pi skill handling note covers skill discovery, additional paths, slash-command expansion, and the Shrimpy integration gap in more detail.

### Background Work And Multi-Agent Scope

The installed coding-agent has no durable background daemon or native cross-agent orchestration layer. Pi `1.0.0` now offers experimental durable tasks, child conversations, and client/server routing through separate packages, as assessed above. Recurring wakeups, external channels, environment administration, and application authorization remain host responsibilities.

The upstream `packages/mom/` example demonstrates one external messaging channel driving queued Pi sessions. It is useful prior art for routing but is narrower than Shrimpy's multi-channel, multi-agent workspace.

## Sources

[Repository](https://github.com/earendil-works/pi) · [`v1.0.0` release](https://github.com/earendil-works/pi/releases/tag/v1.0.0) · [`v0.84.4...v1.0.0` comparison](https://github.com/earendil-works/pi/compare/v0.84.4...v1.0.0) · [Agent-core changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/agent/CHANGELOG.md) · [Coding-agent changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/CHANGELOG.md) · [AI changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/ai/CHANGELOG.md) · [TUI changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/tui/CHANGELOG.md) · [SDK](https://raw.githubusercontent.com/earendil-works/pi/v1.0.0/packages/coding-agent/docs/sdk.md) · [Extensions](https://raw.githubusercontent.com/earendil-works/pi/v1.0.0/packages/coding-agent/docs/extensions.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/v1.0.0/packages/coding-agent/docs/models.md) · [Skills](https://raw.githubusercontent.com/earendil-works/pi/v1.0.0/packages/coding-agent/docs/skills.md) · [Themes](https://raw.githubusercontent.com/earendil-works/pi/v1.0.0/packages/coding-agent/docs/themes.md)
