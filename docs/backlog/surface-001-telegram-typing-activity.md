# 🦐 SURFACE-001: Telegram Typing Activity

Status: draft
Priority: P2
Area: Surfaces
Related: [SURFACE-003](surface-003-chat-operation-status.md)

## Why
Telegram currently receives final visible replies only when an agent calls `send_message`, so long model turns can look idle even though Shrimpy is working. OpenClaw solves this with Telegram `sendChatAction("typing")`, but Shrimpy should treat typing as a surface projection of runtime-owned activity instead of letting Telegram reach into session internals. This should make gateway turns feel alive while preserving channels as communication/logs and sessions as instruction carriers.

## Build
- Add a generic surface activity capability for accepted channel sessions, starting with `typing`.
- Implement Telegram activity as best-effort Bot API `sendChatAction(chat_id, "typing")`.
- Keep Telegram-specific reliability at the adapter edge. OpenClaw's useful lesson is its per-account `sendChatAction` 401 backoff/circuit breaker so a stale token cannot create an infinite typing-request storm.
- Start a keepalive loop when a visible channel message actually becomes an agent turn, and stop refreshing when the turn finishes or errors.
- Add a CLI-first test surface, such as `shrimpy surface activity <channel> --kind typing --duration <seconds>`, so the capability is inspectable without waiting for a model turn.
- Log activity failures to the gateway log without failing the agent turn.

## Boundaries
- Do not append typing events to channel logs; activity is ephemeral surface state, not durable conversation history.
- Do not start typing on raw Telegram update receipt, command handling, ignored messages, or messages rejected by agent wake policy.
- Do not add a full OpenClaw-style typing mode matrix yet. Use one conservative default and leave policy expansion for later.
- Do not implement legacy shims or migration paths.

## Shape
`ChannelDeliveryLoop`/`AgentChannelRuntime` decides whether a visible channel message becomes an agent turn through normal agent wake policy. Once accepted, session execution receives a scoped activity handle for the channel. The handle calls a registry method like `startActivity(channel, { kind: "typing" })`, which resolves by channel prefix to the surface adapter. Telegram maps the channel prefix to `chatId` and sends `sendChatAction`; a small keepalive refreshes every few seconds until disposed. Non-Telegram or unknown routes return false and are ignored.

This should be modeled as `runtime activity -> surface activity projection`, not as a reply-pipeline feature. Telegram owns the Bot API call and topic/chat routing details, but the session runtime owns the processing state.

## Implementation Notes
- Extend `src/channels/egress.ts` (`EgressRegistry`) with an activity route beside `send`.
- Extend `src/channels/bus.ts` with a non-logging activity helper, probably separate from `deliverText`.
- Implement `sendChatAction` in `src/surfaces/telegram/client.ts` and register Telegram activity in `src/surfaces/telegram/surface.ts`.
- Add a small Telegram activity guard for repeated authorization failures, following OpenClaw's adapter-side `sendChatAction` backoff pattern.
- Start/stop the activity around the accepted gateway turn lifecycle in `src/sessions/registry.ts`, after `shouldHandleMessage` has passed in `src/agents/channel-runtime.ts`. Do not hook typing to turn-context preparation or Pi's provider-bound context event; those are model-context concerns, not surface activity.
- Keep the direct TUI's existing activity indicator conceptually aligned: both TUI animation and Telegram typing are surface renderings of active session work.
- Keep tests focused on surface prefix dispatch, Telegram API call shape, lifecycle cleanup, and no activity for ignored messages.

## Done
- A Telegram chat shows native “Typing...” while an accepted Shrimpy agent turn is running.
- Ignored messages, Telegram commands, and non-handled channel messages do not emit typing.
- The CLI can trigger a short typing activity for a channel for manual verification.
- Unit tests cover adapter registry activity routing and session lifecycle cleanup.
