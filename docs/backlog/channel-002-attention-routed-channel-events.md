# CHANNEL-002: Channel Message Routing

Status: review
Priority: P1
Area: Channels
Depends On: none

## Why

Shrimpy should have one way for asynchronous work to reach agents: write a
message to a channel.

Schedules already work this way. Future one-time schedules, workers, and app
events should use the same path. If each feature invents its own callback,
return channel, or routing state, debugging "why did this agent run?" gets hard.

## Rule

1. Something writes a message to a channel.
2. If the message has `origin.addressedAgentId`, the gateway sends it only to
   that agent. This is mainly for explicit user-facing addressing.
3. Otherwise, the gateway sends the message to the agents listed as members of
   that channel.
4. Each member agent's `attention` config decides whether the message becomes a
   turn.
5. If the agent needs to report somewhere else, it sends a normal message to
   that channel.

For system-created messages, prefer step 3 and step 4: target a channel, then
let membership and attention decide who handles it.

## Current State

- `src/delivery/channel-delivery-loop.ts` implements the addressed-or-members
  dispatch rule.
- `src/agents/channel-policy.ts` decides whether one agent handles one channel
  message.
- `shrimpy channels members <channel>` shows who is subscribed to a channel.
- `shrimpy agent attention <id> --channel <channel>` shows the effective
  attention policy.
- `shrimpy agent attention test <id> ...` explains whether one sample message
  would become a turn.
- Recurring schedules now write scheduler-authored channel messages instead of
  using hidden `origin.addressedAgentId` routing.
- `shrimpy schedules` and `shrimpy schedules show <id>` report target channel,
  members, expected attention, recent emitted message ids, and diagnostics.
- Turn context includes route, addressed-agent, attention, and scheduler facts
  with inspect commands.

## Remaining

- Keep backlog items linked to this note instead of restating separate routing
  rules.
- When a new async feature writes a channel message, include enough facts on the
  message to inspect where it came from: source kind, source id, target channel,
  run/idempotency id when relevant, and a CLI inspect command.
- Add clearer channel-level diagnostics as part of
  [CHANNEL-001](channel-001.md), especially for "this message did not produce a
  turn" cases.
- Keep worker and app-agent events on ordinary channels unless a concrete
  limitation forces a separate design.

## Boundaries

- Do not add a separate callback, return-channel, continuation, or routing
  control plane.
- Do not create schedule-specific, worker-specific, or app-specific routing when
  ordinary channel messages plus attention are enough.
- Do not silently add channel membership or loosen attention to make a message
  produce a turn. Show the mismatch in inspection output.
- Do not make skills, memory, or worker state responsible for routing turns.
  They can inform turns, but channel messages start asynchronous turns.
- Do not remove explicit user addressing unless a separate item deliberately
  replaces that user-facing affordance.

## Related Items

- One-time scheduled messages use this same ordinary channel-message path.
- [CHANNEL-001](channel-001.md) should make channel logs searchable and
  traceable enough for this rule to be easy to debug.
- [CODE-002](code-002-agentic-worker-sessions.md) should keep worker state
  inspectable without adding worker-specific routing.

## Done

- The routing rule is documented in stable docs, setup prompts, CLI output, and
  linked backlog notes.
- Recurring schedules use ordinary channel messages and attention routing.
- Schedule inspection can point from a scheduled turn back to the channel
  message, source schedule, and attention explanation.
- Future async features can follow this note without adding another routing
  system.
