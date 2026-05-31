# 🦐 SURFACE-003: Chat Operation Status Updates

Status: todo
Priority: P2
Area: Surfaces
Depends On: none

## Why
Telegram and future chat adapters should be able to show small operational status updates when Shrimpy is doing user-relevant background maintenance for an active chat. The immediate case is session compaction: today a Telegram-backed gateway session can start, finish, or fail compaction without any visible chat signal, leaving the user with no clue that the agent's working context was summarized.

This should grow into a general operations status mechanism for chat surfaces, not a Telegram-only compaction special case.

## Build
- Add a generic chat operation status path for routed channel sessions.
- Start with compaction lifecycle statuses:
  - compaction started
  - compaction finished
  - compaction failed or was aborted
- Implement Telegram delivery for those statuses with compact, plain-language messages.
- Keep the status mechanism available for future chat adapters such as Discord.
- Make status emission configurable by operation and surface, with conservative defaults.
- Include enough metadata for adapters to format the status without reading private session internals directly: channel, agent id, session label, operation kind, phase, and optional error summary.
- Add a CLI-first inspection or test command for sending a synthetic operation status to a channel.
- Log delivery failures without failing the underlying operation.

## Boundaries
- Do not mutate or summarize the Telegram-visible chat transcript.
- Do not expose private session summary content, model prompts, token counts, or provider internals in user-facing status text by default.
- Do not make every internal event a chat message. Only surface events that explain visible delay, changed working context, or actionable failure.
- Do not replace ephemeral activity indicators such as typing status; this is a visible status/update path, not a keepalive.
- Do not hardwire Telegram into session or compaction code. Route through the shared channel/surface boundary.
- Do not add legacy shims or migration paths.

## Shape
Introduce a small operation-status delivery primitive beside normal text delivery and ephemeral activity. Session/runtime code emits typed operation status events; channel egress routes them by channel prefix; each chat adapter decides how to display them.

This should share the same surface-boundary shape as [SURFACE-001](surface-001-telegram-typing-activity.md), but not the same semantics: activity is ephemeral and refreshed while work is running; operation status is a visible one-shot update for user-relevant lifecycle events.

For compaction, Pi already emits `compaction_start` and `compaction_end` events on the session. Shrimpy should bridge those events for gateway sessions that have an attached channel. Telegram can format these as short system-ish bot messages such as:

- `Compacting working context...`
- `Working context compacted.`
- `Compaction failed; I may need a reset or larger-context model.`

Exact wording should be adapter-neutral in shared code and adapter-specific at the edge where needed.

## Implementation Notes
- Build on the current compaction event subscription in `src/sessions/open.ts`.
- Thread a scoped operation-status publisher into gateway session opening, likely from `SessionRegistry` or `AgentChannelRuntime`, so direct `tui` and `run` sessions do not publish chat statuses.
- Extend `src/channels/egress.ts` and `src/channels/bus.ts` with a non-message or clearly typed status delivery path.
- Keep this parallel to, but distinct from, the ephemeral surface activity route used for typing.
- If statuses are appended to channel logs, store them as typed system/status messages, not as fake agent replies. If they are not logged, make that explicit and inspectable through gateway logs.
- Add Telegram formatting in `src/surfaces/telegram/surface.ts` or a nearby outbound helper.
- Consider dependencies and overlap with [SURFACE-001](surface-001-telegram-typing-activity.md): typing is ephemeral while a turn is running; operation status is a visible chat update for important lifecycle events.
- Add tests for compaction start/end routing, Telegram formatting, disabled status policy, and no status emission for direct local sessions.

## Done
- A Telegram-backed gateway session can visibly report compaction start, success, and failure when enabled.
- The mechanism is generic enough for future chat adapters to implement without touching compaction internals.
- Status updates do not expose private session contents or provider internals.
- Direct local sessions do not emit chat operation statuses.
- CLI or tests can trigger a synthetic operation status for adapter verification.
- Unit tests cover routing, formatting, config gating, and failure isolation.
