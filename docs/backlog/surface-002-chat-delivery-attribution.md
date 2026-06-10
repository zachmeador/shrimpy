# 🦐 SURFACE-002: Chat Delivery Attribution

Status: todo
Priority: P2
Area: Surfaces
Depends On: [CHAN-001](chan-001-typed-egress-outbox.md)

## Why
Chat surfaces often expose one visible Shrimpy account even when multiple internal agents can deliver into the same user-facing channel. For example, an app-agent watch can write a poem into a Telegram session, but Telegram shows the message as coming from the Shrimpy bot account. The channel log records the real `sender`, and egress now passes that typed message to adapters, but surfaces still do not decorate outbound messages when attribution would help.

Shrimpy should preserve the one-visible-account pattern while making cross-agent deliveries legible at the surface edge.

The delivery plumbing now belongs to [CHAN-001](chan-001-typed-egress-outbox.md): the outbox hands adapters typed deliveries carrying the published `ChannelMessage` and publication intent. The remaining problem here is choosing and applying a surface decoration policy.

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
[CHAN-001](chan-001-typed-egress-outbox.md) delivers typed `ChannelMessage`s to adapters; this item is the presentation policy applied at render time. The adapter decides whether the transport needs decoration for the delivered sender.

Telegram can compare the message sender against the channel/session's default visible agent and publication intent metadata. If the delivered sender is a different internal agent, it prepends a compact attribution label using `sender.displayName` when available, otherwise a friendly form of `agent:<id>`. Unknown senders fall back to the existing plain delivery behavior.

## Progress
- [CHAN-001](chan-001-typed-egress-outbox.md) now hands typed `ChannelMessage`s to adapter egress through the outbox; this item owns only attribution decoration.
- Telegram delivery already consumes publication intent metadata for quiet or low-urgency notifications.
- Remaining work here is the attribution policy and Telegram decoration behavior for non-default or non-addressed agent senders.

## Implementation Notes
- Apply decoration where the CHAN-001 outbox invokes the adapter's typed render-and-send; do not reintroduce a parallel raw-text path.
- Update Telegram outbound rendering in `src/surfaces/telegram/surface.ts` to decorate only when sender attribution is needed.
- Consider a small shared helper under `src/surfaces/shared/` for choosing attribution labels so future chat adapters can reuse the policy.
- Related: [channels.md](../reference/channels.md) keeps channel-emitting app-agent work inspectable; this item keeps later cross-agent chat deliveries legible at the surface.
- Add tests for plain default-agent delivery, decorated non-default agent delivery, and preservation of the stored channel text.

## Done
- A non-default agent delivering into a Telegram-backed chat is visibly attributed in the Telegram message.
- The channel JSONL entry still stores the original message text and typed `sender`.
- Default Shrimpy replies remain visually unchanged in the common case.
- Unit tests cover egress metadata plumbing and Telegram decoration behavior.
