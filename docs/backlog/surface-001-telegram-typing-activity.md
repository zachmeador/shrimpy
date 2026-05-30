# 🦐 SURFACE-001: Telegram Typing Activity

Status: todo
Priority: P2
Area: Surfaces

## Why
Telegram currently receives final visible replies only when an agent calls `send_message`, so long model turns can look idle even though Shrimpy is working. OpenClaw solves this with Telegram `sendChatAction("typing")`, but Shrimpy should layer it through its surface boundary instead of letting Telegram reach into session internals. This should make gateway turns feel alive while preserving channels as routing/logs and sessions as instruction carriers.

## Build
- Add a generic surface activity capability for routed channels, starting with `typing`.
- Implement Telegram activity as best-effort Bot API `sendChatAction(chat_id, "typing")`.
- Start a keepalive loop when a routed agent turn is actually accepted for handling, and stop refreshing when the turn finishes or errors.
- Add a CLI-first test surface, such as `shrimpy surface activity <channel> --kind typing --duration <seconds>`, so the capability is inspectable without waiting for a model turn.
- Log activity failures to the gateway log without failing the agent turn.

## Boundaries
- Do not append typing events to channel logs; activity is ephemeral surface state, not durable conversation history.
- Do not start typing on raw Telegram update receipt, command handling, ignored messages, or messages rejected by attention policy.
- Do not add a full OpenClaw-style typing mode matrix yet. Use one conservative default and leave policy expansion for later.
- Do not implement legacy shims or migration paths.

## Shape
`ChannelDeliveryLoop`/`AgentChannelRuntime` decides whether a message becomes an agent turn. Once accepted, session execution receives a scoped activity handle for the channel. The handle calls a registry method like `startActivity(channel, { kind: "typing" })`, which resolves by channel prefix to the surface adapter. Telegram maps the channel prefix to `chatId` and sends `sendChatAction`; a small keepalive refreshes every few seconds until disposed. Non-Telegram or unknown routes return false and are ignored.

## Implementation Notes
- Extend `src/channels/egress.ts` (`EgressRegistry`) with an activity route beside `send`.
- Extend `src/channels/bus.ts` with a non-logging activity helper, probably separate from `deliverText`.
- Implement `sendChatAction` in `src/surfaces/telegram/client.ts` and register Telegram activity in `src/surfaces/telegram/surface.ts`.
- Start/stop the activity around `runSessionTurn` in `src/sessions/registry.ts`, after `shouldHandleMessage` has passed in `src/agents/channel-runtime.ts`.
- Keep tests focused on routing, Telegram API call shape, lifecycle cleanup, and no activity for ignored messages.

## Done
- A Telegram chat shows native “Typing...” while a routed Shrimpy agent turn is running.
- Ignored messages, Telegram commands, and non-handled channel messages do not emit typing.
- The CLI can trigger a short typing activity for a channel for manual verification.
- Unit tests cover adapter registry activity routing and session lifecycle cleanup.
