# 🦐 SURFACE-005: Surface Publication Layer

Status: done
Priority: P2
Area: Surfaces

## Why
Chat surfaces should not mirror an agent's private work session. Telegram and future chat apps are the frontstage: the user should see intentional, concise messages that make sense for the app, not tool traces, dead ends, internal notes, or every assistant utterance.

The split is architecturally right: agents work privately, channel logs preserve durable events, and outbound messages are explicit. The rough edge was ergonomic: `send_message(channel, text)` is a low-level transport primitive, so agents had to think in channel IDs instead of surface-appropriate publication intents.

Shrimpy now has a small publication layer above raw channel send, while keeping raw send available as an escape hatch.

## Outcome
- Added active-channel publication helpers: `reply(text)`, `ask(text)`, `notify(text, opts)`, and `report(summary)`.
- Bound helpers to the current channel when gateway and direct sessions build their daemon tools.
- Preserved private agent sessions as the default working space; ordinary assistant text is still private transcript text.
- Stored publication intent metadata on agent text channel messages.
- Carried notification metadata for `urgency`, `quiet`, and `batchable`.
- Taught Telegram egress to treat quiet or low-urgency notifications as silent delivery using Telegram's `disable_notification`.
- Kept `send_message(channel, text)` as the lower-level primitive for explicit routing and unusual cases.

## Boundaries
- Do not make normal assistant transcript text automatically visible on chat surfaces.
- Do not expose tool traces, chain-of-work, or scratch messages to Telegram by default.
- Do not replace append-only channel logs or mutate stored history for display concerns.
- Do not build a broad rich-rendering system yet; start with a tiny intent layer for user-facing text.
- Do not hide the underlying channel/send primitives from advanced workflows.

## Shape
Think of the stack as:

- Private session: agent thinks, works, calls tools, and drafts.
- Channel log: durable shared event history.
- Publication API: intentional user-facing messages.
- Surface adapter: app-specific rendering and delivery.

A channel-triggered turn exposes a simple active-surface publication path. For example, `reply("Done - I fixed the schedule.")` publishes to the active Telegram-backed channel, while `send_message("telegram~shrimpy~1356014767", text)` remains available when explicit transport targeting matters.

Intent metadata stays small. The important distinction is not fancy formatting; it is whether the agent is answering, asking for input, notifying about progress, or reporting a completed result.

## Implementation Notes
- Publication helpers are daemon tools, not automatic transcript mirroring.
- `ChannelBus.sendAgentText` publishes a typed channel message, then passes a delivery object to egress so adapters can inspect the message and publication metadata.
- Gateway sessions build tools per channel so publication helpers are bound to the active channel.
- Direct sessions also pass their configured channel, which keeps local testing and automation ergonomic.
- Telegram still renders text plainly through the existing formatter; intent metadata only affects silent delivery for quiet/low-urgency notifications.

## Acceptance
- In a channel session, agents can publish to the active user-facing channel without manually naming the canonical channel ID.
- Private session output remains private unless explicitly published.
- Publication helpers preserve or attach intent metadata for adapters.
- Telegram delivery remains concise and user-facing, not transcript-like.
- Tests cover active-channel publication, preservation of private transcript behavior, and raw `send_message` escape-hatch behavior.
