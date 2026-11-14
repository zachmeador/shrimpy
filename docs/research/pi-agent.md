# 🦐 Pi

Originally researched: 2026-06-11
Updated: 2026-10-02 and 2026-11-11. Upstream Features Left for Later and the durable investigation are as of Pi 1.0.0.
Trimmed: 2026-11-11. Git has the whole note.
Status: Research. The durable investigation ran probes; nothing was installed or run for the 2026-11-11 update.

Shrimpy's agents run their sessions on the durable runtime of Pi, which Earendil makes. The question: what changed in Pi and Earendil's other projects after the 1.0.0 that Shrimpy pins, and what does that mean for Shrimpy? The note also keeps Pi features left for later and a source and crash-recovery investigation of the durable runtime.

The 2026-11-11 update read Earendil's repositories, the npm registry, three outside apps on `pi-durable` 1.5 and Shrimpy's `wip` branch. Its statements come from the sources linked here or under [Sources](#sources) unless marked **(I)** for this research's inference.

## Current recommendation

**Keep every Pi package Shrimpy names pinned at exactly 1.0.0 until the owner picks a wire, and bump none alone (I).** As of 2026-11-11:

- **Upstream removed what Shrimpy's programs talk through.** Pi 1.2.0 (2026-10-12) removed `pi-client`, `pi-server` and `pi-protocol`, and Chord 1.2.0, Pi's library for apps across processes, removed the service runtime Shrimpy's contracts are written in. The plan still prescribes them. Shrimpy still installs because it pins every Pi package it names at exactly 1.0.0 **(I)**.
- **Moving `pi-durable` (Durable below) past 1.1.0 means a new wire (I):** a new transport and protocol for the three programs and their clients. The three choices and their costs are [below](#options-for-shrimpys-wire).
- **Chord v2, the experimental runtime that has been Chord's main entry since 1.5.1, fits only the gateway's browser entry (I).** Its wire changed twice at one protocol version between 2026-11-09 and 2026-11-11. Earendil plans p3 to replace p2, its prototype web app on Chord v2, and p3's plan puts the decision on how much of Chord's app kit to keep in the week of 2026-11-16.
- **`shrimpy login`'s Anthropic subscription presents each agent that uses it to Anthropic as Claude Code.** `pi-ai` 1.0.0 reports Claude Code 2.1.280, which Anthropic's API refused for `claude-fable-5-2` in reports of 2026-11-09 and 2026-11-10. `pi-ai` 1.5.2 reports 2.1.322, and whether it runs under Durable 1.0.0 wasn't checked.

## Upstream After 1.0.0

### What changed, by release

Pi (MIT; copyable) cut eleven releases after 1.0.0 (2026-10-01), up to 1.5.2 (2026-11-10). These seven bear most on Shrimpy, and the breaking patches 1.0.3 and 1.0.4 are counted under [what upgrading takes](#what-upgrading-pi-durable-takes):

| Release | Date | What changed |
|---|---|---|
| 1.1.0 | 2026-10-07 | The last release of `pi-client`, `pi-server` and `pi-protocol`, and the last set in which they share a Chord with `pi-durable` |
| 1.2.0 | 2026-10-12 | `pi-client`, `pi-server` and `pi-protocol` are "removed and no longer released" ([release](https://github.com/earendil-works/pi/releases/tag/v1.2.0)). Chord replaces its service runtime with a host runtime over memory, IPC or WebSocket links |
| 1.3.0 | 2026-10-15 | From here each `pi-durable` pins Chord at its own version |
| 1.4.0 | 2026-10-21 | Durable moves SQLite storage to schema 2 on first open: "a deployment cannot roll back past this release" |
| 1.5.0 | 2026-11-02 | Durable sends views as windows of the newest 50 to 100 entries, paged on a client with `ConversationTranscript`. Chord v2 appears as experimental `@earendil-works/chord/next` |
| 1.5.1 | 2026-11-09 | A patch release makes v2 Chord's main entry, which the repository's `main` branch had since 2026-11-02, and removes v1, taking `replicatedState` with it: "Apps still on v1 pin `@earendil-works/chord@1.5.0`". The JSON helpers move to `/json` |
| 1.5.2 | 2026-11-10 | `pi-ai` reports Claude Code 2.1.322 instead of 2.1.280 ([below](#pi-ais-anthropic-sign-in)) |

Chord has had three runtimes: the service runtime up to 1.1.0, in which Shrimpy's contracts are written; v1, the host runtime of 1.2.0 to 1.5.0; and v2, experimental, the main entry since 1.5.1. In v2 an app is built from objects served by hosts, each a process or a browser tab, and a link connects two hosts ([design.md](https://github.com/earendil-works/pi/blob/main/packages/chord/docs/design.md) §2).

On npm the three removed packages stop at 1.1.0, and none is marked deprecated as of 2026-11-11. p2's handoff notes say Chord replaced them, and list deprecating them as work to do. [#11715](https://github.com/earendil-works/pi/issues/11715) (2026-11-03) asked for a supported client and server interface, or extension points. A bot closed it automatically as not planned, and no maintainer has replied. Beyond the handoff notes, no maintainer statement about a successor, or about a Pi-level client protocol coming back, was found.

### What Shrimpy uses of the removed pieces

Of the 586 TypeScript files under `src/`, 49 import a removed package or a Chord name removed in 1.2.0, and 30 of those are outside tests and test support. Seven more, five of them outside tests, import only `replicatedState` or its types. Paths below are under `src/`:

- **`pi-server`:** the three programs' servers on Unix sockets (`*/server.ts`), and the route and session offers in `lib/offer` and `agent/access`.
- **`pi-client`:** `lib/connection`, `ServerError` in `lib/refusal`, the Unix transports, and the WebSocket transports Shrimpy wrote for browsers and for Node on `pi-client`'s `ByteTransportFactory`.
- **`pi-protocol`:** only `DEFAULT_MAX_FRAME_LENGTH` and `isServerId`.
- **Chord's service runtime:** the contracts' five services (`Gateway`, `SessionDirectory`, `SessionService`, `Chat`, `ThreadService`) and the connection, offer and refusal code in `lib/`.
- **Chord's `replicatedState`:** the agent and chat contracts, the session and thread views they publish, and `lib/connection`. Since 1.5.1 it is gone from Chord altogether: it left with v1, and v2's design rejects it as public API.

A move past 1.1.0 therefore also needs an answer to the item on [the author's list](../REDESIGN/AUTHOR-TO-REVIEW.md) about what a refusal is in Shrimpy's contracts, which the list calls not urgent **(I)**. `Refusal` extends Chord's `RemoteServiceError`, `isRefusal` checks `pi-client`'s `ServerError`, and both are gone.

Today's install works because of Shrimpy's exact pins **(I)**:

- `package.json` pins `chord`, `pi-ai`, `pi-client`, `pi-durable`, `pi-protocol`, `pi-server` and `pi-tui` at exactly 1.0.0. The lockfile holds one Chord, 1.0.0, and `pi-telemetry` 1.0.1, which `pi-ai` asks for as `^1.0.0`.
- The lockfile matches the registry, which still serves those tarballs, so `npm ci` should rebuild today's tree **(I)**.
- The removed packages and `pi-durable` 1.0.0 ask for `chord` only as `^1.0.0`, which now resolves to 1.5.2. Chord 1.2.0 and later lack the runtime `pi-client` and `pi-server` call, and 1.5.1 and later lack the `replicatedState` and `copyJson` that `pi-durable` 1.0.0 imports from Chord's main entry (`copyJson` moved to `/json`). Shrimpy's exact Chord pin keeps all four on 1.0.0.

The plan and Shrimpy's docs still prescribe the removed packages. [PLAN.md](../REDESIGN/PLAN.md) defines a route as where Pi's server sends a connection, and defers plain HTTP until a program "can't speak Pi's protocol". [1-programs.md](../REDESIGN/design/1-programs.md) pins the packages, [2-contracts.md](../REDESIGN/design/2-contracts.md) makes them the transport, and [code-layout.md](../REDESIGN/design/code-layout.md) and [how-it-is-built.md](../how-it-is-built.md) describe the contracts as Chord services carried by `pi-server` and `pi-client`. That is a mismatch between the plan and upstream: building to the plan means building on packages upstream no longer releases **(I)**. The decision is under [For the owner](#for-the-owner).

### What upgrading `pi-durable` takes

- **Chord moves with it.** `pi-durable` 1.2.0 needs Chord `^1.2.0`, and later releases pin their own. Bumping `pi-durable` alone would install a second, newer Chord under it, and Shrimpy would hand that Durable contexts and state made by Chord 1.0.0, so Shrimpy's own Chord pin moves too **(I)**. Then `pi-client` and `pi-server` stop loading, and the transport and contract layer is replaced at once **(I)**.
- **The storage move is one way.** A home's SQLite storage that 1.4.0 or later has opened can't be opened by today's build again. An update that carries 1.4.0 or later moves each home's storage the first time its agent opens it, homes in use included **(I)**.
- **How much breaks.** Durable's changelog lists 54 breaking entries since 1.0.0, 34 of them in 1.5.0, and 5 more unreleased as of 2026-11-11. Chord's lists 34, from 1.2.0 to 1.5.1.
- **An install snag.** Chord 1.5.1 and 1.5.2 pin their optional `ws` peer at exactly 8.21.0, and Shrimpy depends on `ws` 8.22.0, so npm likely refuses to install them together **(I)**. An unreleased fix in Chord's [changelog](https://github.com/earendil-works/pi/blob/main/packages/chord/CHANGELOG.md) makes the `ws`, `react` and `esbuild` peers ranges, so that npm "no longer refuses to install Chord" ([#12008](https://github.com/earendil-works/pi/issues/12008), filed over a newer React, closed 2026-11-11).

Calls Shrimpy makes that changed, with paths under `src/`:

| Change | Release | Where Shrimpy calls it |
|---|---|---|
| `ToolExecutionResult.content` becomes `output` | 1.2.0 | The tools' answers: `agent/message-tools/results.durable.ts`, `agent/wakeups/check-back.durable.ts`, `agent/questions/ask-agent.durable.ts` |
| `TaskRuntime.sleep` is removed and `sleepUntil` added | 1.4.0 | Wake-ups, triggers and questions: `agent/wakeups/wakeups.durable.ts`, `agent/triggers/task.durable.ts`, `agent/questions/questions.durable.ts` |
| `viewState()` is removed | 1.5.0 | `agent/sessions/service.durable.ts` |
| `subscribeCommits` becomes `observeCommits` | 1.5.0 | `agent/turns/working.durable.ts` |
| `onReport` takes one tagged `Report` | 1.5.0 | `agent/host/host.durable.ts` |
| Tool schemas move from TypeBox to JSON Schema through `pi-schema` | 1.5.0 | Tools built with `pi-ai`'s TypeBox `Type`: `agent/message-tools/send.durable.ts` and `read.durable.ts`, `agent/wakeups/check-back.durable.ts`, `agent/questions/ask-agent.durable.ts` |

### Chord v2, and how stable it is

As of 1.5.2 (2026-11-10; MIT; copyable), Chord v2 offers:

- **Links** over memory, IPC to a forked child and WebSocket. There is no Unix-socket link, and Shrimpy's programs talk over Unix sockets.
- **`/http`,** a listener that denies by default; its links endpoint refuses anonymous upgrades. A host other than loopback must be allowed and counts "as https". Whether the listener serves TLS itself or needs a proxy in front wasn't checked, and [6-network.md](../REDESIGN/design/6-network.md) doesn't count on a proxy: "Shrimpy serves its own entry".
- **`/app`,** a kit that runs one server per data directory, with owner sign-in and device pairing built in. Its sign-in and pairing code isn't exported, so using it outside the kit means copying parts and rewriting the rest. The [clients note](clients-scout-2026-11-11.md#sign-in-rules-from-the-strongest-apps) says what copies and gives Chord's request rules.
- **`/web`, `/react` and `/tui`,** browser and terminal hosts. The terminal's sandbox needs Node 26.5.1 or later, while the package, like Shrimpy, declares Node 22.19 or later.
- **Contract versions** (`evolve`, `checkAccepts`): a provider can accept an older version of a contract, and a peer it can't accept gets `contract_mismatch`.

Only the gateway's browser entry fits the kit **(I)**. A Node app on Chord v2 has "one shape": one addressable server, workers the app starts, and clients that reach workers only through the server ([design.md](https://github.com/earendil-works/pi/blob/main/packages/chord/docs/design.md) §3). p2 runs its own server instead of the kit's. Shrimpy's agents start from their own services, some on other machines, so they are neither the kit's workers nor its clients **(I)**. Making them the gateway's children would undo the plan's direction that agents run outside any gateway and keep working without it ([PLAN.md](../REDESIGN/PLAN.md#direction)) **(I)**. It would also break attaching to an agent while the gateway is down, which [2-contracts.md](../REDESIGN/design/2-contracts.md) promises **(I)**.

Chord v2 is marked experimental, and no deprecation or support policy was found:

- The first line of its `src/index.ts` reads "Chord (`@earendil-works/chord`, v2, experimental)", and `pi-durable`'s README says "The API changes without notice between releases."
- The repo's release rule is "`patch` = fixes + additions, `minor` = breaking changes. No major releases." Patch releases have carried breaking changes anyway: Durable 1.0.3 and 1.0.4, and Chord 1.5.1.
- Its wire changed twice between 2026-11-09 and 2026-11-11 while `PROTOCOL_VERSION` stayed 1, which Chord keeps "Until p3 ships" (design.md §22). A peer of another version is refused, and "hosts update together" (§27), so a version check alone wouldn't catch those changes **(I)**.
- 82 of the last 100 commits to Chord, from 2026-11-02 to 2026-11-11, are by one author.
- p3's plan puts the decision on "how much of the app kit to keep" in the week of 2026-11-16. p3's status of 2026-11-09 calls the kit "too big", which reopens a decision of 2026-11-06 to keep it.
- None of the three outside apps on Durable 1.5 that were checked uses Chord's links or objects: Pi Pocket and Ultimate (both MIT; copyable) and Cherry Studio (AGPL-3.0; study only). They import Chord's `/context` and `/json` helpers, which Durable's API takes.

### Options for Shrimpy's wire

The gateway's browser entry listens on loopback and pipes each WebSocket to a program's Unix socket. Its code says "Nothing authenticates a connection to the browser entry yet" ([web.ts](../../src/gateway/web/web.ts)). The costs below are this research's reading of the sources above **(I)**.

| | (a) Chord v2 on Durable 1.5.x | (b) Hold at Durable 1.0.0 or 1.1.0 | (c) Shrimpy's own wire on Durable 1.5.x |
|---|---|---|---|
| Work | Rewrite the contracts as Chord objects, and move the connection, offer and refusal code and the gateway's entries onto hosts and links. Add a Unix-socket link: on the gateway's socket, a connection that doesn't sign in is taken for the owner ([6-network.md](../REDESIGN/design/6-network.md)), and loopback proves nothing on a shared machine. Fit three separately started programs under one Chord server without making agents the gateway's children. Then upgrade Durable from 1.0 to 1.5 | Little now: keep the exact pins; or move to the 1.1.0 set, crossing Durable's 8 breaking entries in 1.0.3, 1.0.4 and 1.1.0; or copy the three packages' MIT source (about 126 KB compiled) into Shrimpy, so the build stops depending on npm serving removed packages. In each, Chord stays pinned exactly at Durable's version | A transport of Shrimpy's own under the same contract shapes, using Chord only for the `Context`, JSON and watch types Durable's API takes. Then upgrade Durable from 1.0 to 1.5 |
| Fits Shrimpy's programs | Only the gateway's browser entry ([above](#chord-v2-and-how-stable-it-is)) | As today | As today |
| Sign-in and pairing | Shrimpy's invitation, issuing the kit's sessions. The kit's own pairing, where a new device asks and the owner approves, is the way round 6-network.md turned down | Shrimpy's invitation, built into the browser entry. Nothing comes from upstream | Shrimpy's invitation, on Shrimpy's own wire |
| Long transcripts | Durable's windows as object state, paged on the client with `ConversationTranscript`, as p2 does | Shrimpy's session view pages itself; Durable 1.0 has no windows | Durable's windows, made into the session view inside the agent, or a disposable cache there that names its source ([1-programs.md](../REDESIGN/design/1-programs.md)), as Pi Pocket keeps its own |
| Upgrades | Lockstep, on a wire that changes under one version number, so Shrimpy still needs its own mismatch check | Nothing from upstream reaches Shrimpy, and each later move crosses 1.4.0 and 1.5.0 at once | At Shrimpy's pace. The link between machines can get a stable protocol, at the cost of keeping it: Pi Pocket's wire went through versions 2 to 6 in about five weeks |

The plan already decides the way in. A page on the gateway's machine gets in with a link carrying a secret only the gateway's OS user can read ([3-identity.md](../REDESIGN/design/3-identity.md)). An agent, a machine of yours and a phone get in with an invitation made at the gateway ([6-network.md](../REDESIGN/design/6-network.md), [using-it.md](../REDESIGN/design/using-it.md)). The options differ only in the code that carries it **(I)**.

(b)'s copied packages and (c) each leave Shrimpy keeping a service framework of its own. [PLAN.md](../REDESIGN/PLAN.md#order-of-work) lists "a generic service framework" under Not building, and [code-layout.md](../REDESIGN/design/code-layout.md)'s test for `lib/` rules one out. (c) also reverses [2-contracts.md](../REDESIGN/design/2-contracts.md)'s "Pi's protocol carries everything Shrimpy ships". Choosing either means changing those lines first **(I)**.

Under (a), a client paging with `ConversationTranscript` would import Durable, which only `src/agent/` may ([code-layout.md](../REDESIGN/design/code-layout.md), enforced by the boundary lint), and depend on Pi's record types, which [2-contracts.md](../REDESIGN/design/2-contracts.md) rules out for clients **(I)**.

**What holding gives up.** Durable's additions since 1.0.0 ([changelog](https://github.com/earendil-works/pi/blob/main/packages/durable/CHANGELOG.md)) include:

- Views windowed to the newest entries, with `ConversationTranscript` to page them.
- Durable sleeps (`sleepUntil`): a sleeping task holds no invocation and survives restarts. Shrimpy's wake-ups, triggers and questions wait inside a phase, which holds an invocation.
- A crash-loop guard: since 1.5.0 a task cut off `settings.restartLimit` times in a row ends, visibly. Shrimpy counts crashes itself (`src/agent/turns/crashes.durable.ts`) for [4-conversation.md](../REDESIGN/design/4-conversation.md)'s rule that a turn resumed and crashed twice is stopped, and [STATUS.md](../REDESIGN/STATUS.md) lists crash loops that count never breaks. Whether Durable's guard covers them wasn't checked.
- Nested tool calls, which the plan's codemode experiment makes ([4-conversation.md](../REDESIGN/design/4-conversation.md)).
- 40 released fixes.

Whether `pi-ai` 1.5.x runs under `pi-durable` 1.0.0 wasn't checked. If it doesn't, holding also freezes the model catalog and the Claude Code version `pi-ai` reports, which Anthropic's API refused for `claude-fable-5-2` ([below](#pi-ais-anthropic-sign-in)) **(I)**.

### Earendil's own apps

p2 is Earendil's prototype web app on Chord v2 and Durable 1.5.2, with a server of its own, and its README calls it unsupported, soon replaced and not to be built on. It is MIT under the repo's LICENSE, so copyable. A contract p2 calls `Chat`, a session view in Shrimpy's words, carries Durable's window as state, which its client pages with `ConversationTranscript`. p2-mac wraps p2 for macOS, and p3, planned to replace p2, had nothing built as of 2026-11-06.

p2 listens only on loopback. A browser signs in once with the startup token or a one-time owner link, and local clients answer an HMAC challenge with the owner's key. Other devices reach p2 through an HTTPS tunnel or proxy and keep a cookie for 30 days. [6-network.md](../REDESIGN/design/6-network.md) doesn't count on a proxy, so that part is a design to study **(I)**. Radius, Earendil's hosted service for Pi, "in early alpha", is a second way in for the owner: p2 keeps a WebSocket open to it, and requests it relays act as the owner. How p2's sign-in compares with other apps', and what it does for push, are in the clients note's [sign-in rules](clients-scout-2026-11-11.md#sign-in-rules-from-the-strongest-apps) and [Pi clients](clients-scout-2026-11-11.md#pi-and-pi-durable-clients).

Through ngrok to a phone, switching conversations in p2 took 0.9 to 1.2 s and one frame of 1,560 KiB. p3's rules in answer: hold page-wide objects once, keep lists per session or paged, turn on compression and set byte budgets ([efficiency.md](https://github.com/earendil-works/pi/blob/main/apps/p3/docs/efficiency.md)).

### pi-ai's Anthropic sign-in

`shrimpy login` lists `pi-ai`'s "Anthropic (Claude Pro/Max)" among its subscriptions, since [sign-in.ts](../../src/agent/host/sign-in.ts) offers every provider in `pi-ai`'s `builtinProviders()`. In `pi-ai` 1.0.0, as Shrimpy pins it, and in 1.5.2, an agent that uses this sign-in is presented to Anthropic as Claude Code:

- **Its system prompt opens with** "You are Claude Code, Anthropic's official CLI for Claude.", ahead of what every agent is told (`src/agent/context/base.ts`). `shrimpy agent context` doesn't show that sentence **(I)**.
- **Sign-in** uses the client ID and scopes of Claude Code's own `claude auth login`, according to a user's report ([claude-code#93216](https://github.com/anthropics/claude-code/issues/93216)). No Anthropic page names that ID.
- **Requests.** For any token containing `sk-ant-oat`, it sends Claude Code's user agent (`claude-cli/<version>`), `x-app: cli`, the `claude-code-20250219` and `oauth-2025-04-20` betas, and Claude Code's casing of tool names. In 1.0.0 and on `main`, the code marks the version and the tool names with the comment "Stealth mode: Mimic Claude Code's tool naming exactly". It goes by the token's text, so such a token entered as an API key goes out the same way.
- **The version.** `pi-ai` 1.0.0 reports Claude Code 2.1.280. Pi issues [#11969](https://github.com/earendil-works/pi/issues/11969) and [#11989](https://github.com/earendil-works/pi/issues/11989) (2026-11-09 and 2026-11-10) report Anthropic's API refusing 2.1.280 for `claude-fable-5-2` with `claude_code_version_too_old`. An agent on that model signed in this way likely meets the same refusal **(I)**. `pi-ai` 1.5.2 reports 2.1.322, Claude Code's current npm version as of 2026-11-11.
- **No warning.** Pi warns that this use "draws from extra usage and is billed per token" only in its coding agent's interactive mode, which Shrimpy doesn't use.

Whether Shrimpy keeps this sign-in, with Anthropic's terms, is the first question in the [coding-agents note](coding-agents-scout-2026-11-11.md#for-the-owner).

Earendil's [pi-claude-code](https://github.com/earendil-works/pi-claude-code), a Pi model provider that runs the owner's own `claude -p` for each turn so that sign-in stays `claude auth login`, is in the [coding-agents note](coding-agents-scout-2026-11-11.md#ready-made-bridges).

## Upstream Features Left for Later

### Native MCP and code-based tool orchestration

Pi `0.99.0` added built-in extensions for MCP, `codemode`, and `tool_search`. Codemode runs model-written JavaScript in QuickJS, calls existing tools in parallel, and returns selected output. It supports structured tool results, namespaces, tool search, nested tool events, and small branch-persistent `store()` values. Pi `1.0.0` shortens its declarations and adds image generation. This is a useful execution pattern for research, inspection, and combining many small tools; Shrimpy need not build its own script orchestrator. [Codemode](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/codemode.md).

MCP supports stdio and streamable HTTP, OAuth, extension registrations, resources, configurable exposure, and deferred discovery. Servers without direct tools connect in the background rather than delaying the first prompt. Pi `1.0.0` fixes deferred-tool restoration after resume/reload and strengthens OAuth server identity and scope handling. [MCP](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/mcp.md).

QuickJS limits the script's direct capabilities. Calls to Bash, MCP servers, and other tools still use those tools' authority. Codemode is not containment of the Pi process or tools, and successful script rollback of its small store does not undo external tool effects.

### Canonical context and actionable turn boundaries

Pi `0.87.0` adds append-only `context_edit` entries. A context edit can omit or replace a message for the model while retaining the raw transcript for inspection. This is a strong foundation for reducing stale context without maintaining a competing message store. [Session format](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/session-format.md).

Actionable `turn_end` and `agent_before_settle` hooks can append structural entries and request one further provider call. They expose projected context, pending input, and outcome; Pi retains queue scheduling. `context` handlers now receive conversation messages without system messages; `context_with_system` provides the explicit full-transcript transformation boundary. `pi.on()` returns an unsubscribe function. [Extension events](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/extensions.md).

### Model routing, classifiers, and images

Experimental virtual models let an extension choose a physical model and thinking level for each request. Selection and dispatch are recorded separately; routing state follows the session branch, and Pi checks compaction against the physical model's limits. This could replace a bespoke router for choosing cheap or capable models. [Virtual models](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/virtual-models.md).

The unified model runtime now supports chat, image, and classifier models. `classify()` exposes typed choice, score, and boolean answers through Jev providers and llama.cpp next-token probabilities; `generateImages()` uses the session's credential resolution. These are candidates for context selection and inexpensive decision gates, and for generating artifacts through tools. Local quality, latency, and routing cost have not been measured. [Models](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/models.md).

### Cache and compaction

Cost-aware prompt-cache warming can keep eligible caches alive during long tool runs; the default is `streaming`, and optional `idle` warming runs between turns. It requires model lifetime metadata and an estimated avoided miss cost of at least $0.05. Warming costs count toward usage and can be controlled by `cache_warming_decision`. This is a new operational behavior to choose explicitly for long-lived agents. [Settings](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/settings.md).

The `session_before_compact` result still only cancels or replaces compaction; it does not add an instruction-only augmentation field.

## Pi Durable Source and Recovery Investigation

A fresh clone for the durable investigation was pinned to `main` commit `a276dabe57911253350bffb93cb7d7aff6a73261`. The durable, Chord, protocol, client, server, and coding-agent experimental runtime source trees are identical to `v1.0.0` at this revision; only empty unreleased changelog headings differ in four of those packages. The source probes below therefore exercise released durable code alongside the inspected current `pi-ai` source.

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

The fresh source clone is clean. The disposable source copy came from `git archive` of the pinned clone. Dependencies were installed with `npm ci --ignore-scripts`. Node was `26.7.0`. Shrimpy's existing research edits were preserved; its package files, source, live `dist/`, workspace, and credentials were not changed.

- Eleven selected upstream test files passed: **278 tests**, covering admission, queues, lifecycle, ownership, task/generation/tool recovery, registry changes, SQLite, JSONL, and storage/runtime boundaries. The tests ran against current source and freshly emitted current `pi-ai` core code. Initial source execution needed that emission because `pi-ai` exports reference `dist`; its whole-package typecheck reported missing generated provider catalogs. This was not a successful full-monorepo build.
- Six actual SQLite process-kill scenarios passed: admitted input, unsafe external effect, declared-safe duplicate effect, task-ID-deduplicated effect, persisted partial model stream, and surviving Bash child. Each recovery used a new Node process, fresh fixture provider/registry, the same database, and no live credentials. All six also checked that retrying the admission ID returned one original input even with changed retry content.
- A separate cancelled-wait probe passed: the waiter rejected while the submission stayed placed, then a reacquired submission returned its final answer.
- The JSONL filesystem-spy and two-owner SQLite probes passed their assertions, confirming the limitations above.
- Three remote-service scenarios passed using real `pi-server`, `pi-client`, the experimental session-worker services, and a durable memory Harness: cancelled wait, disconnect/reconnect/reattach with stale-route rejection, and duplicate admission after a deliberately lost reply. The byte transport and worker lifetime were supplied in process; this did not exercise Unix sockets, worker subprocess supervision, authentication, or SQLite over that transport.

These tests use the faux provider and real filesystem/SQLite/processes. They do not validate real-provider reconnects, provider-owned deferred handles after process death, power failure, OS containment, authenticated remote transport, or Shrimpy's proposed full workflow.

### Consequences for a simpler Shrimpy

The largest deletion opportunity is the inner runtime: custom admission records, turn-completion wrappers, in-memory input queues, transcript/progress projections, local task trees, and cancellation/recovery machinery can become Pi-owned. Application state that must change atomically with an input or task can be a typed document instead of a second journal.

Shrimpy capabilities that shape reasoning can become small durable extensions: identity/context prompt sections, home/memory tools, policy hooks, and subagent recipes. Existing coding-agent extensions cannot be loaded unchanged. Its native MCP/codemode factories, slash commands, selectors, renderers, resource loader, and package manager belong to the other API; reuse requires an explicit adapter or a replacement, and is not established by these probes. The engines under the MCP and codemode factories are separate packages: `@earendil-works/pi-codemode` and `@earendil-works/pi-mcp` are published at `1.0.0` with no Pi dependencies (only `quickjs-wasi` and `cross-spawn` respectively), so a durable extension can wrap them. The coding-agent glue for tool search, namespaces, the `models` global, and store persistence would need porting. Upstream's experimental durable coding-agent reuses model/auth/settings/TUI components but explicitly omits the regular extension ecosystem, prompt templates, images, login UI, and tree navigation.

A minimal host still selects the enduring agent home, creates the model/credential runtime and trusted registry, supplies the execution environment, owns one storage exclusively, and supervises that execution. Ordinary adapters own authenticated external messages, conversation selection, delivery retries, and recurring wakeups. They submit input and observe durable settlement, rather than calling into a Shrimpy-owned model loop. CLI and UI clients operate on the same runtime state.

This supports evaluating a replacement based on `pi-durable`, not another compatibility layer around the present session pool. The unresolved product tradeoff is whether those runtime deletions outweigh the missing coding-agent UI/extension capabilities. The experimental host is useful prior art for answering that, not a finished Shrimpy foundation. [Experimental durable host](https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/src/experimental/durable/README.md).

## For the owner

1. **The wire.** Which wire should Shrimpy's three programs and its web client speak: (a) Chord v2 on Durable 1.5.x, (b) Durable held at 1.0.0 or 1.1.0, or (c) Shrimpy's own wire on Durable 1.5.x? [The options](#options-for-shrimpys-wire) have the costs. (a) and (c) replace all three programs' transport, and the first update that carries either moves each home's storage one way, homes in use included. Copying the removed packages under (b), or choosing (c), means first changing the plan's line against a service framework of Shrimpy's own **(I)**.
2. **When.** Should that choice wait for p3's decision on Chord's app kit, which p3's plan puts in the week of 2026-11-16?
3. **The release.** Should the release, which you called close on 2026-10-08, ship on the 1.0.0 pins meanwhile? The plan's gate bears on it **(I)**: "if client and framework complexity outweigh the runtime savings, revise before going live" ([PLAN.md](../REDESIGN/PLAN.md#order-of-work)).
4. **The plan.** [PLAN.md](../REDESIGN/PLAN.md), [1-programs.md](../REDESIGN/design/1-programs.md), [2-contracts.md](../REDESIGN/design/2-contracts.md) and [code-layout.md](../REDESIGN/design/code-layout.md) rest on `pi-client`, `pi-server` and `pi-protocol`, which upstream removed on 2026-10-12. Should the plan say so now, or once the wire is chosen?
5. **Peers across machines.** 2-contracts.md's "Decide first" item settles the MVP on lockstep upgrades with a reported mismatch. Does the wire choice reopen it, since (c) could give the link between machines a stable protocol of its own?

The Anthropic subscription sign-in is the first question in the [coding-agents note](coding-agents-scout-2026-11-11.md#for-the-owner). Paging long transcripts is the question on long sessions in the [clients note](clients-scout-2026-11-11.md#for-the-owner), which also says what the wire means for the web client.

## Sources

For the older sections: [Repository](https://github.com/earendil-works/pi) · [`v1.0.0` release](https://github.com/earendil-works/pi/releases/tag/v1.0.0) · [`v0.84.4...v1.0.0` comparison](https://github.com/earendil-works/pi/compare/v0.84.4...v1.0.0) · [Coding-agent changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/CHANGELOG.md) · [AI changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/ai/CHANGELOG.md) · [TUI changelog](https://github.com/earendil-works/pi/blob/v1.0.0/packages/tui/CHANGELOG.md) · [Models](https://raw.githubusercontent.com/earendil-works/pi/v1.0.0/packages/coding-agent/docs/models.md)

For [Upstream After 1.0.0](#upstream-after-100), read on 2026-11-11:

- **Pi:** [releases](https://github.com/earendil-works/pi/releases) · [`v1.2.0` release](https://github.com/earendil-works/pi/releases/tag/v1.2.0) · [removal commit](https://github.com/earendil-works/pi/commit/7472cda0d6e51dfbf53c03f46b47aa42ac64bf64) · [packages on `main`](https://github.com/earendil-works/pi/tree/main/packages) · [LICENSE](https://github.com/earendil-works/pi/blob/main/LICENSE) · [release rule](https://github.com/earendil-works/pi/blob/main/.pi/skills/release.md) · [#11715](https://github.com/earendil-works/pi/issues/11715) · [#12008](https://github.com/earendil-works/pi/issues/12008)
- **npm:** [`pi-client`](https://registry.npmjs.org/@earendil-works/pi-client) · [`pi-server`](https://registry.npmjs.org/@earendil-works/pi-server) · [`pi-protocol`](https://registry.npmjs.org/@earendil-works/pi-protocol) · [`pi-durable`](https://registry.npmjs.org/@earendil-works/pi-durable) · [`chord`](https://registry.npmjs.org/@earendil-works/chord)
- **Chord:** [changelog](https://github.com/earendil-works/pi/blob/main/packages/chord/CHANGELOG.md) · [README](https://github.com/earendil-works/pi/blob/main/packages/chord/README.md) · [`src/index.ts`](https://github.com/earendil-works/pi/blob/main/packages/chord/src/index.ts) · [v2 at the root](https://github.com/earendil-works/pi/commit/e9c0ff4d84a69773ae16950e6d8cb0ef224e538f) · [design](https://github.com/earendil-works/pi/blob/main/packages/chord/docs/design.md) · [app kit](https://github.com/earendil-works/pi/blob/main/packages/chord/src/node/app/README.md) · [app kit exports](https://github.com/earendil-works/pi/blob/main/packages/chord/src/node/app/index.ts) · [HTTP layer](https://github.com/earendil-works/pi/blob/main/packages/chord/src/node/http/README.md) · [links](https://github.com/earendil-works/pi/blob/main/packages/chord/src/link/README.md) · [commits](https://github.com/earendil-works/pi/commits/main/packages/chord)
- **Durable:** [changelog](https://github.com/earendil-works/pi/blob/main/packages/durable/CHANGELOG.md) · [README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md)
- **Apps on Durable 1.5:** [Pi Pocket architecture](https://github.com/TannerMidd/pi-pocket/blob/main/docs/architecture.md) · [Ultimate PR #126](https://github.com/HazAT/ultimate/pull/126) · [Cherry Studio harness](https://github.com/CherryHQ/cherry-studio/blob/main/packages/agent-runtime-pi-durable/src/behavior/harness.ts)
- **Earendil's apps:** [p2 README](https://github.com/earendil-works/pi/blob/main/apps/p2/README.md) · [p2 `package.json`](https://github.com/earendil-works/pi/blob/main/apps/p2/package.json) · [p2 server](https://github.com/earendil-works/pi/blob/main/apps/p2/src/hosts/server.ts) · [p2 handoff](https://github.com/earendil-works/pi/blob/main/apps/p2/docs/handoff.md) · [p2 notes](https://github.com/earendil-works/pi/blob/main/apps/p2/docs/p2-notes.md) · [p2 chat contract](https://github.com/earendil-works/pi/blob/main/apps/p2/plugins/chat/contract.ts) · [p2-mac README](https://github.com/earendil-works/pi/blob/main/apps/p2-mac/README.md) · [p3 plan](https://github.com/earendil-works/pi/blob/main/apps/p3/docs/plan-2026-11-11.md) · [p3 efficiency](https://github.com/earendil-works/pi/blob/main/apps/p3/docs/efficiency.md) · [p3 status](https://github.com/earendil-works/pi/blob/main/apps/p3/docs/status-2026-11-09.md) · [p3 decisions](https://github.com/earendil-works/pi/blob/main/apps/p3/docs/decisions.md) · [p3 handoff](https://github.com/earendil-works/pi/blob/main/apps/p3/docs/handoff.md) · [Radius in Pi's provider docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)
- **pi-ai's Anthropic sign-in:** [OAuth](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/anthropic.ts) · [requests](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts) · [version commit](https://github.com/earendil-works/pi/commit/a05e3a0776) · [#11969](https://github.com/earendil-works/pi/issues/11969) · [#11989](https://github.com/earendil-works/pi/issues/11989) · [claude-code#93216](https://github.com/anthropics/claude-code/issues/93216) · [Claude Code on npm](https://registry.npmjs.org/@anthropic-ai/claude-code/latest) · [Pi's billing warning](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/interactive-mode.ts)
- **pi-claude-code:** [repository](https://github.com/earendil-works/pi-claude-code)
