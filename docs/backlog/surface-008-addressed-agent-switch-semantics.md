# 🦐 SURFACE-008: Addressed-Agent Switch Semantics

Status: todo
Priority: P1
Area: Surfaces
Depends On: none

## Why
`/agent <id>` on Telegram validates the id against all configured agents, writes surface thread state, and sends a Telegram-only confirmation. Three gaps follow from what it does *not* do:

- **Silent drop.** Membership is never checked. Surface channels are seeded with only the surface default agent, so switching to a never-joined agent means subsequent messages are offered only to members, every member ignores them ("addressed to someone else"), and the addressed agent never sees them. The user gets dead air — while `/new` and `/thinking` for that same agent *work*, because `SessionControlRuntime` acts regardless of membership. Inconsistent and confusing.
- **Invisible switch.** Nothing is published to the channel log. The switched-in agent is never told it was addressed; the switched-out agent just stops receiving turns mid-conversation; `channels read` shows a conversation that changes interlocutor with no marker.
- **Cold handoff.** The incoming agent opens its own per-(agent, channel) session — correct by design — and turn context already gives it an unread count plus a `channels read --after` pointer, so it *can* catch up. But it has no signal that a handoff just happened or who held the thread before.

## Build
- Membership guard on switch: when the target agent is not a channel member, auto-join it and say so in the confirmation. The user's intent is explicit; making them run `shrimpy channels join telegram~main~123 --agent mechanic` first is a trap. Log the join so visibility changes stay inspectable.
- Publish a `surface_addressing` status message into the channel log on every switch (and on `surface set-agent`/`clear-agent` from the CLI), recording previous and new addressed agent. The Telegram confirmation then rides the normal logged-status path once [CHAN-001](chan-001-typed-egress-outbox.md) lands; until then, publish the system message alongside the existing direct confirmation.
- Handoff context: the switch status in the log means the incoming agent's first turn context (which already surfaces unseen channel messages) includes the switch fact for free. Verify the channel-unread fact and `read_channel` are enough for a clean pickup; only add a dedicated handoff fact if transcripts show agents missing the switch.

## Boundaries
- Addressing stays a message fact evaluated by agent policy; the switch must not bypass membership or wake policy beyond the explicit auto-join.
- Do not transplant or share session state between agents; per-agent sessions per channel are correct. Catch-up happens by reading the channel, which agents already do well — do not add a mechanism that trains them out of it.
- Do not auto-*leave* the previous agent; visibility is cheap and history-reading is useful. Wake policy already keeps it quiet.
- No retroactive markers for past switches in existing logs.

## Implementation Notes
- Switch handling lives in `src/surfaces/telegram/commands.ts` (`case "agent"`); the membership store is `src/channels/membership.ts` (`addAgent`); CLI twin in `src/commands/surface.ts`.
- `surface_addressing` content belongs in the [CHAN-002](chan-002-message-kind-discriminants.md) status union; until that lands, `publishSystem` with a `kind: "surface_addressing"` payload matches the current session-control pattern.
- Mind the wake guard in `src/agents/channel-policy.ts`: the status message should not itself wake agents under default policies (system sender, not addressed).
- Tests: switch to non-member delivers the next message instead of dropping it; switch is visible in `channels read`; switch back resumes the original agent's existing session; status message wakes nobody by default.

## Done
- Switching to any configured agent never silently drops subsequent messages.
- Every addressed-agent change is a typed, inspectable entry in the channel log, from both chat and CLI.
- The incoming agent's first turn after a switch has enough context to pick up the thread, verified against a real transcript.
- Switch-back resumes the prior agent's session with its context intact.
