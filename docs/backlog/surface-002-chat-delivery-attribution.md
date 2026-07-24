---
status: todo
priority: P2
area: Surfaces
depends_on: []
---

# 🦐 SURFACE-002: Chat Delivery Attribution

## Why
Chat surfaces often expose one visible Shrimpy account even when multiple internal agents can deliver into the same user-facing channel. For example, an app-agent watch can write a poem into a Telegram session, but Telegram shows the message as coming from the Shrimpy bot account. The channel log records the real `sender`, and egress now passes that typed message to adapters, but surfaces still do not decorate outbound messages when attribution would help.

Shrimpy should preserve the one-visible-account pattern while making cross-agent deliveries legible at the surface edge.

The completed channel outbox work hands adapters typed deliveries carrying the published `ChannelMessage` and publication intent. The remaining problem here is choosing and applying a surface decoration policy.

## Build
- Thread the resolved surface instance's `defaultAgentId` into Telegram outbound rendering alongside the typed `ChannelMessage` that egress already receives.
- When an agent-authored message's `sender.actorId` differs from the instance default agent, render a visually separate attribution header followed by a blank line and the unchanged message body, for example `📨 **Message from Ole Scrappy**`.
- Use `sender.displayName` when present and otherwise show the explicit actor id. Never hide an unknown non-default sender behind the ordinary default-agent presentation.
- Keep default-agent replies in the current plain format.

## Boundaries
- Do not mutate the durable channel message text just to satisfy a surface display concern.
- Do not append separate attribution events to channel logs.
- Do not require separate Telegram bot accounts per internal agent.
- Do not decorate inbound human messages or command responses unless they are delivered through the same outbound agent-message path.
- Do not build a broad persona/theming system yet; this is sender attribution, not rich rendering.
- Do not add legacy shims or migration paths.

## Shape
The channel outbox delivers typed `ChannelMessage`s to adapters; this item is the presentation policy applied at render time. The adapter decides whether the transport needs decoration for the delivered sender.

Telegram compares an agent message's sender with the configured default agent for that surface instance. A different internal agent gets a compact header such as `📨 **Message from Ole Scrappy**`, then a blank line, then the original message body. The label uses `sender.displayName` when available and the exact `sender.actorId` otherwise. This first policy is deterministic and has no user-facing configuration.

## Progress
- The channel outbox now hands typed `ChannelMessage`s to adapter egress; this item owns only attribution decoration.
- Telegram delivery already consumes publication intent metadata for quiet or low-urgency notifications.
- Remaining work here is passing the instance default into outbound rendering and decorating non-default agent senders.

## Implementation Notes
- Apply decoration where the channel outbox invokes the adapter's typed render-and-send; do not reintroduce a parallel raw-text path.
- Update Telegram outbound rendering in `src/surfaces/telegram/outbound.ts` and its egress registration to decorate only non-default agent messages.
- Keep label selection as a small pure rendering helper. Move it into `src/surfaces/shared/` only when Discord or another adapter uses the same rule.
- Related: [channels.md](../reference/channels.md) keeps channel-emitting app-agent work inspectable; this item keeps later cross-agent chat deliveries legible at the surface.
- Add tests for plain default-agent delivery, the separate `📨 **Message from <agent>**` header on non-default agent delivery, fallback actor-id attribution, and preservation of the stored channel text.

## Done
- A non-default agent delivering into a Telegram-backed chat is visibly distinguished from the normative agent with a separate `📨 **Message from <agent>**` header.
- The channel JSONL entry still stores the original message text and typed `sender`.
- Default Shrimpy replies remain visually unchanged in the common case.
- Unit tests cover egress metadata plumbing and Telegram decoration behavior.
