# CHANNEL-002: Agent-Owned Channel Wakes

Status: draft
Priority: P1
Area: Channels
Depends On: none

## Why

Shrimpy needs one legible answer to "who can see this channel message?" and a
separate agent-owned answer to "do I wake for it?"

The current implementation splits that answer across the delivery loop,
agent attention/wake policy, and repeated addressing checks:

- `src/delivery/channel-delivery-loop.ts` chooses addressed-agent-or-members.
- `src/agents/channel-runtime.ts` applies a second agent attention/wake gate.
- `origin.addressedAgentId` is interpreted in multiple places.

That creates a real bug shape: an addressed message can wake an agent that is
not a channel member. It also makes the system harder to reason about than the
IRC-like model Shrimpy wants: a channel is a room/log, membership means an agent
is in the room, and each member decides whether to wake.

At the same time, the useful part of the older channel-events note should
remain: channel communication must be durable, attributed, inspectable, and
traceable. Human/user messages should preserve stable sender and transport
provenance. Agent messages should preserve the sending agent identity,
publication intent when relevant, and source channel/session context when known.
Non-human producers such as agent-owned watches, managed worker sessions, apps,
or signal projections should include source provenance and useful diagnostics. The
correction is not to create a central router or rename Shrimpy-owned attention
config to "wake" config. The correction is to keep channels as semantic
communication logs, with agent-owned wake and response decisions at the edge.

## Rule

1. **Channels are communication spaces.** A channel can be a chat, app log,
   work feed, agent DM, or other meaningful shared room. Do not create fake
   channels merely to smuggle lifecycle or world-state wakes through the system.
2. **Membership = presence/visibility.** A channel message is visible to agents
   that are present in that channel or otherwise explicitly given channel
   visibility. Membership is a pure set; it carries no wake policy.
3. **Each agent owns its wake policy.** Shrimpy runs agents; agents run their
   wake and response policies. A present agent can decide to wake because the
   user `@mention`ed it, because another agent addressed it, because it cares
   about that user/channel/topic, or because it otherwise wants to respond.
4. **Addressing and mentions are policy inputs, not routing.** `@scrappy` does
   not invoke a central router; it is a fact in the message that Scrappy's own
   wake policy may care about. The agent still needs visibility into the channel
   to notice the mention.
5. **Channel messages are attributed and inspectable.** User-origin messages
   preserve stable sender/user identity when known plus transport/chat metadata.
   Agent-origin messages preserve the sending agent identity, publication intent
   when relevant, and source channel/session context when known. Non-human
   producers such as agent-owned watches, managed worker sessions, apps, or signal
   projections include source kind, source id, target channel, run/idempotency id
   when relevant, and a CLI inspect command.
6. **Operational state can live outside channels.** Watches, workers, signals,
   and wakes may have first-class records. They should project into channels only
   when that projection is meaningful communication or a useful semantic log.

There is no central router and no Shrimpy-owned wake policy control plane.
Channels provide visibility; agents decide whether to wake.

## Current State

- `src/delivery/channel-delivery-loop.ts` still has an addressed-agent bypass
  before channel presence fan-out.
- `src/agents/channel-policy.ts` makes the attention/wake decision
  independently of membership.
- `src/channels/membership.ts` is already close to the desired shape: a pure
  channel-presence set.
- The current `shrimpy agent attention <id> ...` and
  `shrimpy agent attention test <id> ...` commands inspect/explain the old
  attention gate.
- The current `shrimpy schedules` command, plus `shrimpy channels show` and
  `shrimpy channels search`, already demonstrate useful provenance and
  diagnostics for emitted messages.

## Build

- Make membership/presence the sole channel visibility source in
  `channel-delivery-loop.ts`. Remove the `addressedAgentId` branch so the loop
  does not route around channel presence.
- Move the wake decision entirely onto the agent. Addressing, mentions, sender
  provenance, channel identity, and schedule/worker provenance become inputs to
  the agent's own wake policy.
- Make live dispatch and inspection ask the same agent-owned wake path for an
  explanation. Shrimpy may expose the explanation, but it must not own the
  policy.
- Remove duplicated addressing checks and helper drift.
- Replace the `shrimpy agent attention` CLI surface with agent wake inspection.
  Do not keep old command names, aliases, compatibility wrappers, or legacy
  config paths merely to prevent breakage.
- Update diagnostics so an addressed-to-non-member message clearly reports that
  the agent has no visibility into the channel and therefore cannot notice the
  mention.
- Preserve and tighten channel-message attribution and provenance. Inspection
  should answer who/what produced a message, where generated messages came from,
  why an agent woke, and why another agent did not wake.
- Review setup/default docs for broad heartbeat/status-channel language.
  Agent-owned watches or future wake records should be agent-owned; channels
  should remain meaningful communication/log spaces.
- Optional/related: derive message kind from typed protocol data instead of
  repeated string sniffing in channel inspection.

## Boundaries

- Do not keep a second wake gate in the delivery loop. The loop fans out; the
  agent decides.
- Do not let `origin.addressedAgentId` bypass channel membership.
- Do not fold wake policy into the membership record. Membership stays a pure
  presence/visibility set.
- Do not keep Shrimpy-owned `attention` policy as a compatibility layer, rename
  it to `wake`, or preserve old config/CLI surfaces just to avoid breaking old
  workspaces. Replace old concepts directly when they conflict with the agent
  ownership boundary.
- Do not add a central routing control plane, callback system, return-channel
  mechanism, or master status channel.
- Do not silently add membership or loosen wake policy to force a turn. Show the
  mismatch in inspection output.
- Do not make channels the only place operational evidence can exist. Channels
  are semantic communication logs; watches, workers, signals, and wakes may
  need their own inspectable state.
- Do not remove explicit user addressing as an affordance. Reframe it as an
  input to the addressed agent's wake policy that only works when the agent is
  present in the channel or otherwise explicitly has channel visibility.

## Open Questions

- Does any current flow rely on addressing an agent with no visibility into the
  channel? If so, that flow must give the agent channel visibility or become a
  clearly documented exception with a different primitive.
- What is the exact first-class record shape for future non-channel wakes and
  world signals? This item should leave room for that without turning channels
  into the universal lifecycle bus.

## Related Items

- [SCHED-001](sched-001-scheduler-job-runner.md): agent-owned watches should
  follow this channel/wake boundary when they emit channel messages.
- [CODE-002](code-002-agentic-worker-sessions.md): workers should keep state in
  worker records and use normal channels only when they need to communicate.
- [CTX-009](later/ctx-009-context-trace-debug-view.md): trace/debug views should
  show provenance without creating another routing path.

## Done

- One agent-owned path answers "does this present agent wake on this message?"
- The delivery loop respects channel presence; addressing cannot bypass
  membership.
- Addressing and mentions are handled in exactly one wake-policy path.
- Wake-policy inspection and live dispatch agree by construction.
- Channel messages preserve attribution, and generated channel messages expose
  enough provenance for inspection and diagnostics.
- Tests cover addressed-to-non-member no-wake behavior, explain output matching
  dispatch, agent-owned wake policy inputs, channel-message attribution, and
  generated-message provenance in channel inspection.
