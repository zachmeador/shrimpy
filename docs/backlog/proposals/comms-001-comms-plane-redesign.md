---
status: todo
priority: P1
area: Comms
depends_on: []
---

# 🦐 COMMS-001: Comms Plane Redesign

One rule drives this redesign: **a channel log contains only what could be rendered in a chat transcript.** Conversation, media, and a few conversation-relevant markers. Everything else that currently rides the log — RPC controls, correlated acks, delivery-eligibility oracles, provenance-sniffed behavior — moves to an honest home. This note is self-contained: it carries the full diagnosis, the full target design, and the decisions already made, so the implementing agent does not need the originating conversation.

This is a single complete build on one branch. No phases, no partial landings, no compatibility shims. The old paths are deleted in the same branch that replaces them.

## Why

The channel log currently does four jobs: conversation record, RPC bus, delivery queue, and audit journal. Every consumer pays a filtering tax to see only its plane, and each patch is small but the sum is structural. Concrete evidence in the current tree:

- `shrimpy sessions set` publishes a `control` message into the conversation log, then polls the JSONL file every 100ms for up to 30s looking for a correlated `operation_status` ack (`src/sessions/control.ts`, `waitForStatus`). RPC over a chat transcript with file polling as the reply channel.
- Because controls live in the log, they replay on gateway restart, so the delivery loop keeps a handled-marks store just to dedupe its own command bus (`src/gateway/channel-delivery-loop.ts`, `GatewayRuntimeStateStore`).
- The outbox decides deliverability by provenance-sniffing: agent text, OR system text with `transport === "watch"` AND `watch.actionKind === "command"`, OR `operation_status` (`src/channels/outbox.ts`, `shouldDeliverOutbound`). Watch live-only wake is likewise a special case in backlog replay (`shouldDispatchBacklogMessage`) rather than a message property.
- `reply`/`ask`/`notify`/`report` are four tools with one behavior; the intent tag's only consumer in the system is Telegram's `disable_notification` (`src/surfaces/telegram/outbound.ts`); `batchable` is consumed nowhere.
- Because speaking is a tool, forgetting to speak is a failure mode, patched by a second model call after human turns plus a recovery turn (`src/sessions/channel-reply-watchdog.ts`, `SessionPool.reviewAndRecover`).
- `src/channels/protocol.ts` imports `dm.ts` so message construction can parse channel names and infer addressing. Channel taxonomy is name-encoded (`dm~a~b`, `telegram~inst~chat`) and re-derived by regex (`deriveChannelManifest`) even though a manifest store exists.
- The wake-policy vocabulary is narrow enough that watches may impersonate sender kinds (`emit.senderKind: "human"` in `src/watches/schema.ts`) to satisfy another agent's filters. Routing needs should never be met by identity spoofing.
- Humans are not participants. People are scattered across Telegram `allowedChatIds`, per-instance `users` maps, `state/users.json`, and a presence file. Agents get membership and policy; humans get transport plumbing.
- `docs/reference/channels.md` has already drifted: it says controls are `system` messages and omits the `control`/`status` content types that dominate live logs, and the documented meaning of policy mode `all` contradicts the undocumented agent-sender guard in `src/agents/channel-policy.ts`.

## Current State

Map for the builder; read these before starting.

- Channel storage: append-only JSONL per channel under `workspace/channels/`, byte-offset cursors, fs-watch (`src/channels/store.ts`). This layer is good and stays.
- Message shape: `{id, timestamp, sender{kind, actorId, userId?, displayName?}, origin{transport + ~10 optional provenance fields}, content{type: text|image|image_group|unsupported_media|control|status|system}}` (`src/channels/protocol.ts`, `src/channels/messages.ts`). `messages.ts` is ~650 lines of hand-rolled builders, guards, and readers.
- Membership: `config/channels.json` maps channels to agent-only member sets plus a `manifest` `{kind, binding}` derived from the channel name (`src/channels/membership.ts`, `src/channels/manifest.ts`, `src/channels/dm.ts`).
- Dispatch: gateway delivery loop fs-watches channels; session controls short-circuit to `SessionControlRuntime` before membership fan-out; remaining messages fan out to member agents; each agent's `channelPolicy` (`src/agents/channel-policy.ts`) decides wake; `SessionPool` runs one FIFO lane per (agent, channel) (`src/sessions/pool.ts`, `src/agents/channel-runtime.ts`, `src/gateway/channel-delivery-loop.ts`).
- Speech: channel-session assistant text is private; agents publish via `reply`/`ask`/`notify`/`report`/`send_message` tools (`src/tools/daemon.ts`); a reply watchdog reviews human-triggered turns that published nothing and may run a recovery turn.
- Egress: `ChannelOutbox` tails all channels, filters outbound-eligible records, sends through surface egress, records receipts (`src/channels/outbox.ts`).
- Controls: `shrimpy sessions new|clear|restore|set|stop` route by session ownership — gateway-owned goes over the channel log with correlated polling, unowned applies file ops under a maintenance lease, foreground-owned is rejected (`src/sessions/control.ts`, `src/sessions/ownership.ts`).
- Surfaces: self-contained verticals under `src/surfaces/<name>/` registered via `ChatSurfaceModule` (`src/surfaces/registry.ts`). Telegram surface commands: `/help` and `/status` reply directly on the transport; `/new`, `/clear`, `/stop`, `/thinking` publish control messages (`src/surfaces/shared/remote-commands.ts`).
- Watches: agent-owned, gateway clock persists next-run times, message watches post trigger text into a channel with `transport: "watch"` provenance and configurable sender impersonation (`src/watches/`).
- Workers: detached child processes with `WorkerRecord.parent` lineage and `relatedChannel?`, results finalized to files with no channel post (`src/workers/types.ts`, `src/workers/lifecycle.ts`, `src/workers/supervisor.ts`).
- TUI: bypasses channels entirely; `local/main` sessions with transcript delivery; the owner's primary conversations leave no channel record (`src/sessions/foreground.ts`, `src/tui/`).
- Live logs confirm the mix: the real Telegram channel is ~87% conversation interleaved with `control` requests, `operation_status` acks, and `surface_addressing` statuses.

## Design

### Vocabulary

Four nouns: **actor** (human, agent, or service), **channel** (a durable room with a charter), **session** (one agent's private working context per channel — unchanged), **surface** (transport edge — unchanged structure). One verb: **post**. The primitive keeps the name "channel"; no rename churn.

### Message schema

One schema, three layers: envelope, facts, body. Facts are the entire vocabulary that dispatch, replay, and egress may read. Provenance is a sealed bag no behavior reads.

```json
{
  "id": "uuid",
  "timestamp": 1760000000000,
  "author": { "kind": "human", "id": "zach", "displayName": "Zach" },
  "facts": {
    "to": ["mechanic"],
    "audience": "agents",
    "wake": "live-only",
    "notify": "quiet"
  },
  "body": { "type": "text", "data": { "text": "..." } },
  "provenance": { "transport": "telegram", "transportUserId": "123", "transportChatId": "456", "watchId": "...", "runId": "..." }
}
```

- `author.kind` is `human` | `agent` | `service`. `author.id` is the stable actor id: person id for humans, agent id for agents, a slash-namespaced id for services (`watch/<owner>/<local-id>`, `worker/<worker-id>`, `cli`, `gateway`). The `human:`/`agent:` prefix convention inside a single actorId string dies; kind and id are separate fields. Authorship is declared and never spoofable: nothing may author as a kind it is not.
- `facts.to` — optional array of agent ids; the message wakes only listed agents (generalizes today's `addressedAgentId`). Usually length 1.
- `facts.audience` — `channel` (default) or `agents`. An `agents` post is an aside: visible in history and to member agents, never delivered externally. This one fact replaces the outbox eligibility oracle and lets agents coordinate inside transport-bound channels without reaching the human's phone.
- `facts.wake` — `normal` (default) or `live-only`. Live-only posts are skipped during backlog replay (today's watch replay rule, declared instead of classified).
- `facts.notify` — `quiet` | `normal` | `urgent` surface hint. Telegram maps `quiet` to `disable_notification`. `urgent` is a hint with no behavior yet. The `batchable` concept is dropped.
- Body types: `text`, `image`, `image_group`, `unsupported_media` (all unchanged), plus `marker`. The `control`, `status`, and freeform `system` content types are deleted.
- `marker` bodies: `{ "kind": "session_boundary" | "addressing" | "agent_lifecycle", "text": "one renderable line", ...structured fields }`. Markers default to `audience: agents` and never egress. They replace `operation_status`, `surface_addressing`, and the `agent_added`/`agent_updated` system events currently published to `home` by `src/agents/operations.ts`.

One typebox schema module (`src/channels/schema.ts` or equivalent) is the single source for these types: compile-time types and runtime validation derive from it. The `PublishXInput` builder swarm in `protocol.ts` and the hand-rolled guard/reader swarm in `messages.ts` are deleted, not wrapped.

### Channel charters

`config/channels.json` becomes charters — the single source of truth for channel semantics, written at creation, never derived from names:

```json
{
  "channels": {
    "telegram~main~123": {
      "members": { "agents": ["shrimpy"], "people": ["zach"] },
      "dm": false,
      "binding": { "adapter": "telegram", "instance": "main", "thread": "123" },
      "purpose": "optional short note"
    }
  }
}
```

- Channel names become opaque labels (existing charset validation in `src/channels/names.ts` stays). Conventional labels like `telegram~main~123` and `dm~a~b` survive as conventions only; nothing parses them. `deriveChannelManifest`, the manifest `kind` field, and `src/channels/dm.ts` are deleted.
- `dm: true` marks direct-message channels. In a dm channel, dispatch stamps `facts.to` = the member agents other than the author. This replaces publish-time DM addressing inference and covers both agent↔agent and person↔agent DMs.
- People are members alongside agents. Surface ingress creates charters with the binding and default members at creation time (surface default agent + the resolved person).

### Attention and dispatch

One evaluation function, in one place, over declared facts only:

1. Author is the evaluating agent → skip (self-authored).
2. `facts.to` present and the agent is not listed → skip.
3. Sender filters: policy may narrow by author kinds and author ids (person ids, agent ids, service ids — all filterable, no impersonation needed). Filter precedence over addressing is unchanged from today.
4. Mode: `all` | `mentions` | `addressed` | `none`, semantics as today, with one rule promoted from hidden guard to documented default: agent- and service-authored posts without `to` or a single `@mention` wake only policies that explicitly opt into that author — the loop guard, stated in docs and in `channel-policy explain` output.

Per-channel policy overrides, `shrimpy agent channel-policy` inspection, and the explain command all stay, simplified to this single path. Watch posts are authored `service` with real ids; agents whose filters must admit their own watches list those service ids (or rely on `to`). The `senderKind`/`senderActorId`/`senderUserId` watch emit fields are deleted from the schema.

### Speech: reply defaults, post, hold

The default follows the trigger's author:

- A turn triggered by a **human-authored** message auto-posts its final assistant text to the channel when the turn published nothing to that channel and `hold` was not called. Explicit mid-turn posts suppress the auto-post (no duplication).
- A turn triggered by an **agent- or service-authored** message keeps final text private; the agent posts explicitly when there is something to say.

Both defaults match their common case, so both failure modes become rare and visible. The reply watchdog, its recovery prompts, and the `replyRecovery` lane states are deleted — human-triggered turns cannot end accidentally silent.

Tool surface shrinks from six to four:

- `post(text, {channel?, to?, notify?})` — publish to the active channel by default or an explicit channel; `user:<id>` presence alias still resolves. Replaces `reply`, `ask`, `notify`, `report`, and `send_message`.
- `hold()` — suppress the auto-post for this turn; the intentional-silence record is the tool call in the session transcript.
- `wake(delaySeconds | at, note)` — see below.
- `read_channel(channel, limit?)` — unchanged.

Publication intent (`kind`, `urgency`, `quiet`, `batchable`) disappears from the message schema; `notify` on `post` is its surviving remnant. Delivery instructions (`src/instructions/delivery.ts`) collapse to one mental model: your final message is your reply; tools message elsewhere and elsewhen. Implementation seam: the pool owns a per-turn delivery state (posted-to-active-channel flag, held flag) that the tools mutate; today's session-scoped `activePublicationChannel` closure becomes lane-owned turn state.

### Self-wake and worker lineage

The async continuation story, first-class:

- **`wake(delaySeconds | at, note)`** writes a one-shot, agent-owned, auto-expiring watch: `trigger: { kind: "once", at: <ms> }` in the existing watch schema, target = the current channel, `to` = self, `audience: agents`, `wake: live-only`. The existing clock machinery gives persistence across gateway restarts (missed one-shots fire on next start), FIFO queuing behind an in-flight user turn (same lane), and inspection (`shrimpy watches` lists pending one-shots; channel history shows fired ones). Auto-removed after firing. Cancellation is CLI-side (`shrimpy watches` removal); no agent-facing cancel tool in this build.
- The note is load-bearing: the agent writes its own instruction ("codex run on auth refactor finished — read the result, report to the channel"), and it arrives in-context at the wake moment. Machinery-triggered turns default to hold, so the note is what carries the intent to speak.
- **Worker reports:** when a worker turn finalizes (`src/workers/lifecycle.ts` / the supervisor path), append a report post into `WorkerRecord.relatedChannel`: author `{kind: "service", id: "worker/<id>"}`, `to` = `ownerAgent`, `audience: agents`, body text = summary plus artifact paths. Publish is file-append, so the detached supervisor needs no IPC. Normal dispatch wakes the owner in the same channel session with full conversational context; the owner reads the result and posts the human-facing report. Worker dispatch must record `relatedChannel` whenever the dispatching turn is a channel turn.

The chat-surface expectation this serves: a user on Telegram asks for a codex worker; the agent dispatches, answers "running — I'll report when it's done", and the completion post (or a self-set `wake`) brings the same session back to deliver the report. No polling, no special wake path.

### Control plane: socket, fallback, markers

The gateway gets a front door; the log stops being one.

- Unix domain socket at `runtime/gateway.sock`, newline-delimited JSON, `{id, op, params}` → `{id, ok, result | error}`. Operations: `session.reset`, `session.restore`, `session.set`, `session.stop`, `session.status`, `gateway.status`, `surface.set-agent`, `surface.clear-agent`, `channel.activity`. Publishing is explicitly **not** a socket op — appending to channel files from any process remains the publish path.
- Ownership routing keeps today's shape with an honest transport: CLI commands use the socket when a gateway owns the session; unowned sessions fall back to direct file operations under the existing maintenance lease; foreground-owned sessions still reject external mutation ("use that host's controls").
- One ops module replaces `SessionControlRuntime`: invoked by the socket server, by gateway-internal callers (surface commands), and mirrored by the CLI's lease fallback. Lifecycle operations write a `session_boundary` marker into the channel (the visible "— new session —" line the transcript should show) and the session store keeps its own `shrimpy_lifecycle` records as today.
- Surface state commands (`/new`, `/clear`, `/stop`, `/thinking`) call the ops module directly (they run inside the gateway process) and confirm directly on the transport, exactly like `/help` and `/status` already do. Symmetric commands, no control/ack message pairs, no outbox involvement.
- Deleted outright: `control` and `status` content types, `SessionControlRuntime`, the correlated log-polling in `sessions/control.ts`, control replay dedupe in the gateway runtime state store, and the `[Control: ...]`/`[Status: ...]` renderings in `src/context/turn/channel-message.ts`.

### People

One store, `config/people.json`:

```json
{
  "people": {
    "zach": {
      "displayName": "Zach",
      "identities": { "telegram": ["1356014767"] },
      "remoteCommands": "full"
    }
  }
}
```

- Surfaces resolve transport user → person at ingress; the message author is `{kind: "human", id: "<person-id>"}`. Senders in allowed chats with no person mapping author as a transport-scoped fallback id (`telegram/123456`) with no grants.
- `remoteCommands` (`full` | `read-only` | `none`) is the grant consumed by the shared remote-command service; the per-instance Telegram `users` map and `state/users.json` (`IdentityStore`) are absorbed and deleted. Telegram `allowedChatIds` stays per instance — chat-level ingress allowlisting is legitimately transport config.
- Presence (`user:<id>` alias → last active surface channel) stays as runtime state keyed by person id.
- Channel charters list people as members. Setup writes the owner's person entry.

### Egress

The outbox keeps its tail/receipts/retry machinery and replaces the eligibility oracle with one rule: deliver when the channel has a binding AND `facts.audience` is `channel` AND `author.kind` is not `human` AND `body.type` is not `marker`. Command-watch emissions become service-authored `audience: channel` posts (they are user-facing output); message-watch trigger text becomes `audience: agents` (it is trigger material). The watch `emit` config gains `audience` and loses sender impersonation.

### TUI as a surface host

The TUI never renders a channel log, so no custom TUI is built. It renders the session — and because a channel turn is a session turn, the Pi transcript for a solo channel is a strict superset of the channel log.

- Bare `shrimpy` / `shrimpy chat <agent>` opens the owner↔agent DM channel (charter `dm: true`, members = the owner person + the agent; conventional label `dm~<person>~<agent>`), with session key `channel/<label>`. Keystrokes publish as human posts authored by the owner; the final assistant text auto-posts back (human-triggered default), which the TUI has already rendered natively as the assistant message.
- The TUI process hosts dispatch for the lanes it owns: it runs the channel file watcher plus the same `AgentChannelRuntime`/`SessionPool` components the gateway uses (they are already host-agnostic). A watch note, worker report, or another agent's post into that channel dispatches into the TUI-owned lane and paints in the terminal as a turn.
- The session-ownership record (`runtime/sessions/`) becomes the dispatcher election: the gateway delivery loop must skip lanes with a live foreground owner, and lane handoff on TUI exit/reclaim uses the existing per-agent per-channel seen/handled state so neither process replays turns the other already ran. Channel messages an agent's policy ignores do not paint in the TUI — the terminal is the mind's-eye view; `channels read` and the web inspector are the room's-eye view.
- `shrimpy run` stays an ephemeral, channel-less escape hatch (an invocation, not a conversation). Setup stays `local/setup`. The `local` namespace shrinks to those uses; primary TUI chat lives in `channel/` sessions.
- **Precondition to verify first:** Pi's interactive session must accept a programmatically injected turn while open (for messages arriving in the channel mid-session). Shrimpy pins its own Pi, so if the capability is missing, extend Pi at that seam — that is the expected pressure point, and it is far cheaper than a custom TUI (see `docs/musings/pi-tui-fork-tradeoffs.md`).

## UX Implications

User-facing:

- `shrimpy sessions new|clear|restore|set|stop` against a live gateway answer over the socket with real replies; the 100ms-poll/30s-timeout path and most `unconfirmed` outcomes disappear. Command names, flags, and JSON outcome shapes stay.
- Telegram `/new`, `/clear`, `/stop`, `/thinking` confirm directly like `/status` does today; channel history shows a one-line marker instead of control/ack records. `channels read` renders a clean transcript.
- Silence becomes trustworthy: human-triggered turns cannot end accidentally silent, and a quiet turn means the agent held (visible in the session transcript).
- Granting a person command access happens once in `config/people.json`, not per Telegram instance; future surfaces inherit it.
- TUI conversations exist as DM channels: inspectable via `channels read`, visible to other agents only per membership (a solo DM stays solo), and background deliveries (worker reports, watch follow-ups, another agent's post) appear in the open terminal instead of only in side channels. Binding a TUI DM channel to a transport becomes possible; it is a choice, never a default.
- The async chat expectation works end-to-end: ask for a worker on a chat surface, get "running", then get the report in the same chat when it finishes.

Agent-facing:

- One mental model everywhere: the final message is the reply; `hold()` chooses silence; `post()` reaches other channels; `wake()` schedules continuation. Delivery instructions shrink accordingly.
- Tool surface: `reply`/`ask`/`notify`/`report`/`send_message` → `post` + `hold` + `wake`; `read_channel` unchanged.
- Honest authorship in prompts: watch turns arrive as `service` authors with real ids; control/status JSON never leaks into prompts.
- Asides: agents can coordinate inside transport-bound channels without buzzing the human.

Regressions to avoid:

- No double replies: auto-post must fire only when the turn published nothing to the active channel.
- No lost confirmations: every surface state command must produce a visible transport reply on success and failure.
- No double dispatch or dropped turns across TUI/gateway lane handoff; ownership gating and seen-state dedupe must cover crash and reclaim paths.
- Watch-driven agents that previously woke via impersonated human senders must be reachable via `to`, mentions, or explicit service-author filters; setup and docs must show the pattern.
- Telegram `notify: quiet` must keep working (silent delivery).

## Deletions

The measure of the build. All removed in the same branch, per the no-legacy rule:

- `control` and `status` content types with their builders, guards, and readers (bulk of `src/channels/messages.ts`).
- `src/gateway/session-control-runtime.ts` and the control-dedupe tracking in `src/gateway/runtime-state.ts`.
- Correlated log-polling (`waitForStatus`) in `src/sessions/control.ts`; the file is rewritten around socket + lease fallback.
- `src/sessions/channel-reply-watchdog.ts`, `reviewCompletedTurn` plumbing in `src/sessions/pool.ts` and `src/agents/channel-runtime.ts`, `replyRecovery` lane states, and the review/recovery instructions.
- `reply`, `ask`, `notify`, `report`, `send_message` tool definitions and the `PublicationIntent` struct; replaced by `post`/`hold`/`wake`.
- `src/channels/dm.ts`, publish-time DM addressing in `protocol.ts`, and `deriveChannelManifest` name regexes plus the manifest `kind` field in `src/channels/manifest.ts`.
- `shouldDeliverOutbound`/`isCommandWatchEmission` oracle in `src/channels/outbox.ts` and `shouldDispatchBacklogMessage` watch classification in the delivery loop; both replaced by facts.
- Watch emit `senderKind`/`senderActorId`/`senderUserId` fields and their parsing in `src/watches/schema.ts`/`runner.ts`.
- `[Control: ...]`/`[Status: ...]` renderings in `src/context/turn/channel-message.ts`.
- `state/users.json` `IdentityStore` (`src/gateway/identity-store.ts`) and the Telegram per-instance `users` map, absorbed by `config/people.json`.
- The `PublishXInput` builder layer in `src/channels/protocol.ts`, replaced by the schema module.

## Boundaries

- One branch, complete. No migration or compatibility code: existing channel JSONL files stay on disk untouched but the new reader does not parse the old shape; fresh logs begin in the new schema. If the maintainer wants old-log migration, that is a separate explicit request.
- No rename of the "channel" primitive, CLI nouns, or workspace paths.
- SECURITY-006 (session authority, admission, sandboxed runners) is compatible but out of scope: its admission step slots after attention evaluation, and its sender grants align with the people store. Do not implement it here.
- No network egress policy, no new surfaces, no web inspector work beyond whatever the schema change breaks.
- `wake` is time-based one-shots only; no event/condition triggers beyond what worker-report posts already provide.
- Publishing stays file-append from any process; the socket never becomes required for posting.
- Agent-facing tools stay at the four listed; no cancel-wake tool, no channel-management tools for agents in this build.

## Open Decisions

- Pi interactive turn injection: verify the pinned Pi can accept an externally injected turn into a live interactive session; if not, extend Pi at that seam before wiring the TUI host. This is the only precondition that could reshape the TUI portion.

## Notes

- The surface proposals (SURFACE-004 Discord, SURFACE-007 web chat, SURFACE-008 Buzz, SURFACE-010 ACP) should build on this plane; each inherits people, facts, and egress instead of re-implementing identity and eligibility.
- `docs/musings/session-model.md` and `docs/musings/asynchronous-agents.md` are the source thinking this design implements: channels as generic rooms with membership as the source of truth, wake as routing plus participant attention, self-scheduled continuation, and worker lineage.

## Touches

- `src/channels/` — schema module (new), store (kept), membership → charters, outbox facts rule, egress, inspection/classification, `bus.ts` slimmed; `dm.ts` and most of `messages.ts`/`protocol.ts` deleted.
- `src/gateway/` — socket server (new), ops module (new), delivery loop (facts, ownership gating), runtime-state (control tracking removed), identity-store deleted.
- `src/sessions/` — `control.ts` rewrite, `pool.ts` turn delivery state + auto-post, watchdog deleted, ownership/lane handoff dedupe.
- `src/agents/` — `channel-policy.ts` single evaluation path, `channel-runtime.ts` plumbing, `operations.ts` lifecycle events → markers.
- `src/tools/` — `post`/`hold`/`wake`, tool names/policy.
- `src/surfaces/` — shared remote commands → ops calls with direct confirmation, chat bridge authoring via people, telegram outbound `notify` mapping, per-instance `users` removal, setup.
- `src/watches/` — one-shot trigger, emit `audience`, impersonation removal, runner authoring.
- `src/workers/` — report post on finalize, `relatedChannel` recording at dispatch.
- `src/context/turn/` — channel message formatting (author/to header, no control renderings).
- `src/instructions/` — delivery guidance rewrite, watchdog prompts deleted.
- `src/tui/` + `src/sessions/foreground.ts` — DM-channel sessions, in-process dispatch for owned lanes.
- `src/config/` — people store, charter parsing.
- Pi (pinned checkout) — interactive turn injection if missing.
- Docs: `docs/reference/channels.md`, `surfaces.md`, `sessions.md`, `architecture.md`, `tools.md`, `runtime.md`, `configuration.md`, `security.md`; `CHANGELOG.md`.

## Done

- Channel logs contain only human/agent/service posts, media, and markers; `channels read` renders a clean transcript; no `control`/`status` records exist anywhere.
- Session control commands round-trip over the socket with real replies; lease fallback covers unowned sessions; no code polls a log for an ack.
- Human-triggered channel turns auto-post final text; `hold` suppresses; explicit posts prevent duplication; the watchdog and its prompts are gone.
- `wake` one-shots fire into the same channel and session, survive gateway restarts, auto-expire, and are inspectable via `shrimpy watches` and channel history.
- Worker completion posts a report into `relatedChannel` and wakes the owner agent; the chat-surface dispatch-and-report flow works end to end.
- Surface state commands confirm directly and leave markers; Telegram quiet delivery works; the outbox delivers exactly the facts rule.
- `config/people.json` drives identity and grants across surfaces; the Telegram `users` map and `state/users.json` are gone.
- TUI chats are DM channels; an external post into an open TUI's channel paints as a turn; gateway and TUI never double-dispatch across handoff.
- Attention is one function over declared facts; `channel-policy explain` reflects it; the agent-author default is documented.
- One schema module validates every message; the hand-rolled guard/builder layers are deleted.
- Docs updated; tests cover the dispatch matrix (author kind × mode × `to`), egress facts rule, socket ops and lease fallback, auto-post/hold/duplication, wake lifecycle across restart, worker report posting, DM addressing from charters, and TUI/gateway lane handoff dedupe.
