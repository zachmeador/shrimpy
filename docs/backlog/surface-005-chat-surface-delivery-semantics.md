# 🦐 SURFACE-005: Chat Surface Delivery Semantics

Status: draft
Priority: P2
Area: Surfaces
Depends On: [SURFACE-002](surface-002-chat-delivery-attribution.md), [SURFACE-003](surface-003-chat-operation-status.md)

## Why
Shrimpy already separates channels, sessions, chat surfaces, and the local TUI, but their user-visible message roles are still blurry.

Gateway agents publish intentional text through channel helpers. Chat egress routes those messages by channel prefix. Telegram is the only implemented chat surface today, but the design should not make Telegram special. The TUI is different: it is the local place to talk to one agent on this machine, not a live chat-surface client for channel traffic.

Shrimpy should make chat delivery explicit enough that agent replies, surface command output, runtime statuses, and internal work do not all look like the same kind of message.

## Build
- Define a shared chat-surface outbound contract for channel-backed chat adapters.
- Keep Telegram as the first implementation of that shared contract.
- Keep the TUI separate from chat-surface delivery; do not add a live channel feed in this slice.
- Add shared presentation behavior for agent text:
  - default surface agent sends plain text
  - other agents get compact attribution, such as `mechanic: ...`
  - durable channel text is not mutated for display
- Add typed operation-status messages for runtime/control events:
  - `session_reset`
  - `session_restore`
  - `session_thinking`
  - `surface_addressing`
  - `compaction`
- Keep read-only commands surface-local:
  - chat `/status`, `/help`, and usage errors
  - TUI `/status`
- For state-changing chat commands, perform the action and emit a visible operation status.

## Boundaries
- Do not turn the TUI into a chat client.
- Do not make Telegram the core abstraction.
- Do not treat command output as agent-authored conversation.
- Do not mutate stored channel text to satisfy display concerns.
- Do not make operation statuses ordinary agent prompts by default.
- Do not add migration or legacy compatibility paths.

## Shape
Channel egress should dispatch typed deliveries instead of treating every outbound item as raw text. Agent text delivery carries the published `ChannelMessage`. Operation status delivery carries structured status data and can also be stored as a system channel message.

Chat adapters render those delivery kinds differently. Telegram maps them to Bot API messages first. Future chat adapters should reuse the same policy.

The TUI keeps its current role: local direct session transcript plus Shrimpy controls and inspection. TUI `/status` stays local UI output.

## Implementation Notes
- Extend `src/channels/messages.ts` with operation-status system content helpers.
- Extend `src/channels/egress.ts` and `src/channels/bus.ts` with typed delivery dispatch.
- Add a shared chat presentation helper under `src/surfaces/shared/`.
- Update Telegram egress in `src/surfaces/telegram/surface.ts`.
- Replace session-control `deliverText` confirmations in `src/gateway/session-control-runtime.ts`.
- Bridge gateway compaction events from `src/sessions/open.ts` only for gateway channel sessions.
- Update docs for channels, surfaces, and sessions.

## Done
- Default-agent chat replies render plain and store plain text.
- Non-default agent chat replies render with attribution and store plain text.
- Read-only chat commands do not publish channel messages or prompt agents.
- State-changing chat commands emit operation statuses.
- Session reset/restore/thinking confirmations are operation statuses, not raw text deliveries.
- Gateway compaction can emit visible chat statuses.
- Direct TUI/run sessions do not emit chat-surface compaction statuses.
- TUI `/status` remains local UI output.
- Tests cover default attribution, non-default attribution, command output, operation status delivery, and no TUI chat-surface behavior.
