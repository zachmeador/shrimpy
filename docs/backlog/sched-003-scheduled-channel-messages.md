# SCHED-003: Scheduled Channel Messages

Status: review
Priority: P1
Area: Schedules
Depends On: [CHANNEL-002](channel-002-attention-routed-channel-events.md)

## Why

Scheduled agent runs used to publish addressed messages into an arbitrary target
channel. That made routing harder to reason about: a schedule could cause an
agent turn through `origin.addressedAgentId` even when that agent was not a
member of the channel where the message was logged.

This item applies the [attention-routed channel-event contract](channel-002-attention-routed-channel-events.md)
to recurring schedules.

## Build

- Make each agent schedule target a channel that participates in the shared
  channel-event routing contract.
- Emit scheduler runs as ordinary channel messages with schedule provenance:
  schedule id, local id, owner agent when applicable, target channel, run id,
  fire time, trigger metadata, and inspect commands.
- Stop relying on `origin.addressedAgentId` to route agent-owned schedules.
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
- Update the Scrappy-style character-agent docs/examples to reference
  [CHANNEL-002](channel-002-attention-routed-channel-events.md) instead of
  addressed-agent schedule routing.

## Review State

- Agent-owned schedules now resolve to unaddressed scheduler-authored channel
  messages. The gateway delivers them through channel membership and attention.
- Fresh setup already seeds `heartbeat` channel membership for the default
  `shrimpy` agent, so default scheduled upkeep keeps working on the shared path.
- Turn context and stable docs now use message-oriented wording instead of
  wake-oriented wording.
- Scheduler-origin messages now carry schedule provenance in `origin.schedule`,
  including owner/local ids, target channel, trigger metadata, and inspect
  commands.
- `shrimpy schedules` and TUI `/status schedules` now show target channel,
  expected attention behavior, session path, next run, last observed run, recent
  emitted message id, and diagnostics for target channels whose membership or
  attention config will not produce a turn.
- Tests cover attention-routed agent schedule resolution, scheduled message
  emission without `addressedAgentId`, turn-context schedule facts, inspection
  diagnostics, and a Scrappy-style scheduled message becoming a turn through
  normal channel membership plus agent attention.
- No remaining implementation work is expected for this item before final
  review.

## Boundaries

- Do not add schedule-specific routing concepts beyond
  [CHANNEL-002](channel-002-attention-routed-channel-events.md).
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

- This complements [SCHED-002](sched-002-schedule-inspection-surfaces.md), which
  should expose target channel, expected attention behavior, and recent emitted
  channel message ids.
- Agent-specific scheduled work can still use a stable internal channel by
  convention.
- The former Ole Scrappy schedule shape is the motivating example: instead of
  logging in a Telegram channel while routing by explicit addressing, the target
  channel should include `ole_scrappy` as a member and that agent's attention
  should opt into the scheduler-authored message.

## Done

- Scheduled runs emit ordinary channel messages with schedule provenance.
- Scheduled runs follow [CHANNEL-002](channel-002-attention-routed-channel-events.md)
  without an addressed-agent routing bypass.
- Schedule turns receive compact context for schedule id, run id, target channel,
  owner/local schedule ids when available, run id, and inspect commands.
- Schedule inspection surfaces show target channel, expected attention behavior,
  session path, next run, last observed run, and recent emitted channel message
  id.
- User-facing delivery from scheduled work is explicit normal agent behavior,
  not a schedule delivery-path feature.
- Tests cover schedule resolution, channel membership, attention behavior,
  scheduled message emission, delivery routing, missing membership/attention
  diagnostics, and a Scrappy-style schedule that becomes a turn through normal
  channel routing.
