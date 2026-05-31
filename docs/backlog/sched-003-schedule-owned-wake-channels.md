# SCHED-003: Schedule-Owned Wake Channels

Status: draft
Priority: P1
Area: Schedules

## Why

Scheduled agent runs currently publish addressed messages into an arbitrary
target channel. This works, but it makes routing harder to reason about: a
schedule can wake an agent through `origin.addressedAgentId` even when that
agent is not a member of the channel where the wake message is logged.

The clearer model is that schedules write ordinary wake messages to ordinary
channels. Channel membership and agent attention decide which agent wakes, and
the agent/channel pair identifies the persistent session. User-facing delivery
should be an explicit return path, not a side effect of using a user-facing
channel as the schedule's wake log.

## Build

- Make one schedule map to one wake channel by default, for example
  `schedule~<agent-id>~<schedule-id>`.
- Treat the wake channel as the session/log channel for the scheduled work.
  It should contain the scheduler wake messages and any private schedule-run
  notes, not the final user-facing output unless the schedule intentionally
  targets that channel.
- Ensure schedule-owned wake channels are normal Shrimpy channels with normal
  membership. A single-agent schedule should have the owning agent as a member
  of the wake channel.
- Stop relying on `origin.addressedAgentId` to route agent-owned schedules.
  Scheduled wakes should be delivered because the owning agent is a member of
  the wake channel and passes attention.
- Add an explicit return or delivery channel concept for schedules that need to
  publish elsewhere, such as a Telegram chat. The Scrappy morning-letter shape
  should become: wake in `schedule~ole_scrappy~morning_poem`, then send the
  finished letter to `telegram~shrimpy~1356014767`.
- Include schedule metadata in turn context: schedule id, local id, wake
  channel, owner agent, run id, fire time, and return channel when configured.
- Update setup/default schedule generation so new recurring schedules use
  schedule-owned wake channels unless a human deliberately chooses a shared
  channel.
- Add validation or repair guidance for schedules whose wake channels are
  missing membership. Prefer inspectable CLI output over silent runtime fixes.
- Update schedule inspection so `shrimpy schedules` and related status surfaces
  show wake channel, return channel, owning agent, session path, last run, and
  next run.
- Update the Scrappy-style character-agent docs/examples to use a private
  schedule wake channel plus explicit user-facing delivery.

## Boundaries

- Do not introduce a second channel system. Schedule wake channels are normal
  channels with normal logs, membership, cursors, sessions, context overrides,
  and inspection commands.
- Do not keep the current addressed-agent schedule path as a compatibility
  shim after replacing it. Existing logs can remain as history, but new runtime
  behavior should use the new model directly.
- Do not silently move or rewrite existing channel logs or session transcripts.
  A workspace can start using the new wake channel on future runs while old
  history remains inspectable where it was written.
- Do not make `reply`, `ask`, `notify`, or `report` magically publish to a
  return channel unless that behavior is deliberately designed. It is acceptable
  for scheduled agents to use `send_message(return_channel, text)` explicitly.
- Do not make skills a schedule control plane. Skills can be loaded or invoked
  by scheduled turns, but schedules remain ordinary config plus channel wakes.

## Notes

- This complements [SCHED-002](sched-002-schedule-inspection-surfaces.md):
  inspection should expose the new wake/return channel model, but the routing
  cleanup is its own runtime change.
- A dedicated wake channel makes per-schedule context customization natural via
  existing channel-specific context overrides.
- The first implementation can keep direct CLI/user addressing if it is still
  useful, but agent-owned schedules should not depend on the addressed-agent
  bypass.
- The current Ole Scrappy schedule is the motivating example: it logs scheduler
  wake messages in a Telegram channel and wakes `ole_scrappy` through explicit
  addressing even though that channel's membership belongs to `shrimpy`.

## Done

- New agent schedules default to a stable schedule-owned wake channel.
- Schedule-owned wake channels have explicit channel membership for the owning
  agent.
- Scheduled agent runs are delivered through normal membership plus attention,
  without an addressed-agent routing bypass.
- Schedule turns receive compact context for schedule id, run id, wake channel,
  and return channel.
- User-facing delivery for schedules with a return channel is explicit and
  inspectable.
- Schedule inspection surfaces show wake channel, return channel, owning agent,
  session path, next run, and last observed run.
- Tests cover schedule resolution, wake-channel membership, delivery routing,
  missing membership diagnostics, and a Scrappy-style schedule that wakes in a
  private channel and sends output to Telegram.
