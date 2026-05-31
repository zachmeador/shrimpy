# SCHED-003: Scheduled Channel Messages

Status: draft
Priority: P1
Area: Schedules
Depends On: none

## Why

Scheduled agent runs currently publish addressed messages into an arbitrary
target channel. This works, but it makes routing harder to reason about: a
schedule can cause an agent turn through `origin.addressedAgentId` even when
that agent is not a member of the channel where the message is logged.

The simpler model is that schedules write ordinary messages into ordinary
channels. Channel membership determines which agents can see that message, and
each agent's attention policy determines whether the message becomes a turn.
There is no schedule-specific channel type, message type, or paired delivery
channel type.

## Build

- Make each schedule target an ordinary channel.
- Emit scheduler runs as ordinary channel messages with schedule provenance:
  schedule id, local id, owner agent when applicable, target channel, run id,
  fire time, trigger metadata, and inspect commands.
- Stop relying on `origin.addressedAgentId` to route agent-owned schedules.
  Scheduled messages should become turns because those agents are members of the
  target channel and their attention policy accepts the message.
- Ensure setup/default schedule generation configures normal channel membership
  and attention deliberately. A schedule may target an internal agent channel by
  convention, but that channel is still just a channel.
- If scheduled work should publish a result somewhere else, encode that as
  ordinary instructions or config the agent can inspect; the agent should use
  normal messaging tools such as `send_message` when it chooses to publish.
- Include schedule provenance in turn context: schedule id, local id, target
  channel, owner agent when applicable, run id, fire time, and emitted channel
  message id.
- Add validation or repair guidance for schedules whose target channels are
  missing the expected membership or whose agents will not handle them because of
  attention config. Prefer inspectable CLI output over silent runtime fixes.
- Update schedule inspection so `shrimpy schedules` and related status surfaces
  show target channel, expected agent attention, session path, last run, next
  run, and recent emitted channel message id.
- Update the Scrappy-style character-agent docs/examples to use ordinary channel
  membership plus attention instead of addressed-agent schedule routing.

## Boundaries

- Do not introduce a second channel system. Scheduled messages live in normal
  channels with normal logs, membership, cursors, sessions, context overrides,
  and inspection commands.
- Do not introduce schedule-specific channel types, message types, or paired
  delivery-channel concepts. Internal work channels are, at most, workspace
  conventions over ordinary channels.
- Do not keep the current addressed-agent schedule path as a compatibility shim
  after replacing it. Existing logs can remain as history, but new runtime
  behavior should use the new model directly.
- Do not silently move or rewrite existing channel logs or session transcripts.
  A workspace can start using updated schedule targets on future runs while old
  history remains inspectable where it was written.
- Do not make `reply`, `ask`, `notify`, or `report` magically publish to another
  channel unless that behavior is deliberately designed. It is acceptable for
  scheduled agents to use `send_message(channel, text)` explicitly.
- Do not make skills a schedule control plane. Skills can be loaded or invoked
  by scheduled turns, but schedules remain ordinary config plus ordinary channel
  messages.

## Notes

- This complements [SCHED-002](sched-002-schedule-inspection-surfaces.md):
  inspection should expose the target channel, expected attention behavior, and
  recent emitted channel message ids, but the routing cleanup is its own runtime
  change.
- Shrimpy already has the attention machinery this should use:
  `src/agents/channel-policy.ts` for routing decisions and
  `shrimpy agent attention test` for inspection.
- Agent-specific scheduled work can still use a stable internal channel by
  convention. The important point is that this is not a separate channel type.
- The first implementation can keep direct CLI/user addressing if it is still
  useful, but agent-owned schedules should not depend on the addressed-agent
  bypass.
- The current Ole Scrappy schedule is the motivating example: it logs scheduler
  messages in a Telegram channel and routes to `ole_scrappy` through explicit
  addressing even though that channel's membership belongs to `shrimpy`.

## Done

- Scheduled runs emit ordinary channel messages with schedule provenance.
- Scheduled runs are delivered through normal membership plus attention, without
  an addressed-agent routing bypass.
- Schedule turns receive compact context for schedule id, run id, target channel,
  and emitted channel message id.
- Schedule inspection surfaces show target channel, expected attention behavior,
  session path, next run, last observed run, and recent emitted channel message
  id.
- User-facing delivery from scheduled work is explicit normal agent behavior,
  not a schedule delivery-path feature.
- Tests cover schedule resolution, channel membership, attention behavior,
  scheduled message emission, delivery routing, missing membership/attention
  diagnostics, and a Scrappy-style schedule that becomes a turn through normal
  channel routing.
