# CHANNEL-002: Attention-Routed Channel Events

Status: draft
Priority: P1
Area: Channels
Depends On: none

## Why

Shrimpy already has the right core shape: producers append messages to channel
logs, the gateway observes those logs, channel membership scopes eligible agents,
and each agent's attention config decides whether a message becomes a turn.

Async features should share that shape instead of growing separate wake,
return-channel, or continuation subsystems. "Wake" should remain a plain-language
effect: an agent handled a channel message. It should not become its own durable
resource, command group, or routing plane.

This item owns the cross-feature contract so schedule, worker, app, channel
inspection, and context items can stay focused on their own implementation
details.

## Contract

- Producers append ordinary channel messages with enough `sender`, `origin`,
  content, and provenance to explain where the message came from.
- Channel membership determines which agents are candidates for an unaddressed
  message.
- An agent's effective attention config determines whether a candidate agent
  handles the message.
- Explicit human/user addressing may remain a direct routing affordance, but
  runtime producers should not rely on `origin.addressedAgentId` as a hidden
  bypass for membership and attention.
- If work should report somewhere else, the agent sends an ordinary message to
  that channel through normal tools and instructions.
- Inspection surfaces should be able to answer: which message caused this turn,
  which channel carried it, which source record emitted it, and which attention
  rule accepted or rejected it.

## Build

- Name this contract in stable docs and keep active backlog items linked to it
  instead of restating the same routing rules.
- Keep channel-event provenance consistent enough for schedules, one-time
  schedules, worker-related messages, app-agent messages, and surface messages to
  be inspected the same way.
- Reuse `src/agents/channel-policy.ts` and `shrimpy agent attention test` as the
  explanation path for why an agent did or did not handle a message.
- Add or adjust diagnostics where routing is hard to understand, favoring CLI
  output over silent repair.
- Treat internal work channels as naming conventions over ordinary channels, not
  a distinct channel type.

## Boundaries

- Do not add `shrimpy wakes`, wake channels, return channels, or a separate
  wake/continuation control plane.
- Do not create special schedule or worker routing paths when ordinary channel
  messages plus attention are enough.
- Do not silently add channel membership or loosen attention to make a producer
  work. Show the mismatch in inspection output.
- Do not make skills, memory, or worker state a routing plane. They can inform
  turns, but channel messages start asynchronous turns.
- Do not remove explicit user addressing unless a separate item deliberately
  replaces that user-facing affordance.

## Related Items

- [SCHED-003](sched-003-scheduled-channel-messages.md) applies this contract to
  recurring scheduled runs.
- [SCHED-004](sched-004-one-time-scheduled-channel-messages.md) applies this
  contract to one-time scheduled messages.
- [CHANNEL-001](channel-001.md) makes channel logs searchable and traceable
  enough for this contract to be legible.
- [SCHED-002](sched-002-schedule-inspection-surfaces.md) explains schedule
  targets, emitted messages, and expected attention behavior.
- [CODE-002](code-002-agentic-worker-sessions.md) keeps worker state inspectable
  without adding a worker-specific wake path.

## Done

- The attention-routed channel-event contract is documented and linked from the
  backlog items that depend on it.
- Schedule and worker backlog items no longer duplicate the routing philosophy;
  they describe only their resource-specific behavior.
- Runtime producers that can start asynchronous agent turns use ordinary channel
  messages or explicitly document why they need an exception.
- Inspection paths can point from an agent turn back to the channel message,
  source record, and attention explanation.
