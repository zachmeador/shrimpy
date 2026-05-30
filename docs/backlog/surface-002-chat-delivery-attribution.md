# 🦐 SURFACE-002: Chat Delivery Attribution

Status: todo
Priority: P2
Area: Surfaces

## Why
Chat surfaces often expose one visible Shrimpy account even when multiple internal agents can deliver into the same user-facing channel. For example, a scheduled app-agent can write a poem into a Telegram session, but Telegram shows the message as coming from the Shrimpy bot account. The channel log already records the real `sender`, but adapter delivery currently receives only `(channel, text)`, so the surface cannot lightly distinguish "Shrimpy replied" from "Ole Scrappy dropped by."

Shrimpy should preserve the one-visible-account pattern while making cross-agent deliveries legible at the surface edge.

## Build
- Pass enough message metadata through channel egress for adapters to inspect `sender`, `origin`, and text content during delivery.
- Add a generic outbound decoration policy for chat adapters, starting with agent attribution.
- For Telegram, prefix or otherwise lightly decorate messages delivered by non-default or non-addressed agents, such as `Ole Scrappy:` followed by the message body.
- Keep default-agent replies in the current plain format unless attribution would resolve ambiguity.
- Make decoration configurable enough to disable or adjust later, but start with one conservative default.

## Boundaries
- Do not mutate the durable channel message text just to satisfy a surface display concern.
- Do not append separate attribution events to channel logs.
- Do not require separate Telegram bot accounts per internal agent.
- Do not decorate inbound human messages or command responses unless they are delivered through the same outbound agent-message path.
- Do not build a broad persona/theming system yet; this is sender attribution, not rich rendering.
- Do not add legacy shims or migration paths.

## Shape
`ChannelBus.sendAgentText` should publish the typed channel message, then pass that published message to egress instead of only passing raw text. `EgressRegistry` can route an outbound delivery object like `{ channel, message }` to the surface adapter. The adapter decides whether the transport needs decoration.

Telegram can compare the message sender against the route's default visible agent or addressed-agent state for the thread. If the delivered sender is a different internal agent, it prepends a compact attribution label using `sender.displayName` when available, otherwise a friendly form of `agent:<id>`. Unknown senders fall back to the existing plain delivery behavior.

## Implementation Notes
- Extend `src/channels/egress.ts` from `deliverText(channel, text)` to a typed delivery object that includes the published `ChannelMessage`.
- Update `src/channels/bus.ts` so `sendAgentText` publishes once and delivers the resulting message.
- Update Telegram egress in `src/surfaces/telegram/surface.ts` to decorate only when sender attribution is needed.
- Consider a small shared helper under `src/surfaces/shared/` for choosing attribution labels so future chat adapters can reuse the policy.
- Add tests for plain default-agent delivery, decorated non-default agent delivery, and preservation of the stored channel text.

## Done
- A non-default agent delivering into a Telegram-backed chat is visibly attributed in the Telegram message.
- The channel JSONL entry still stores the original message text and typed `sender`.
- Default Shrimpy replies remain visually unchanged in the common case.
- Unit tests cover egress metadata plumbing and Telegram decoration behavior.
