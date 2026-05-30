# 🦐 Surfaces

Surfaces translate outside interaction into Shrimpy channels and translate Shrimpy channel replies back to the outside world. Transport details live at the edge; typed channel messages live inside.

## Channels

Channels are durable shared rooms:

- A channel can represent a human chat, an agent DM, a group, a system feed, a work log, or a surface thread.
- Channel logs live under `workspace/channels/*.jsonl`.
- Message content is typed: `text`, `image`, `image_group`, `unsupported_media`, or `system`.
- Message identity is split between `sender` and `origin`.
- Surface users can be mapped to stable Shrimpy user ids so peer cards and attention policy do not depend on transport-specific ids.
- Channel membership controls which agents participate; each agent's `attention` config controls which channel messages become turns.

## Addressing

Surfaces may set `origin.addressedAgentId` on a message. Addressing routes that turn directly to one agent without changing channel membership.

This supports a one-visible-account pattern:

- the user sees one bot/account
- the surface tracks the currently addressed internal agent for that thread
- plain follow-up messages carry that addressed-agent metadata
- channel membership stays stable

`shrimpy surface` inspects and edits addressed-agent state.

## Surface verticals

Each surface lives in its own folder under `src/surfaces/<name>/`. The folder owns:

- `client.ts` — third-party network client
- `poller.ts` (or equivalent) — real-time listener if the transport needs lifecycle
- `bridge.ts` — translates inbound transport messages into the typed channel protocol
- `outbound.ts` — markdown → surface format + chunking
- `commands.ts` — surface-specific command parser/dispatcher
- `config.ts` — config schema, instance resolver, route/default-agent helpers
- `surface.ts` — `SurfaceEgress` and `GatewaySurface` lifecycle wiring
- `index.ts` — exports the `ChatSurfaceModule` registered in `src/surfaces/index.ts`

Shared primitives live in `src/surfaces/shared/`: `ChatSurfacePublisher`, `PendingByThread`, `mergeChatTextBurst`, `SurfaceThreadStateStore`, the `ChatSurfaceModule` interface, and the `SurfaceEgress` / `GatewaySurface` types.

A new surface is a `surfaces/<name>/` folder appended to the array in `src/surfaces/index.ts`. `AppRuntime` iterates the registry to resolve config, build adapter routes, and route channels to default agents.

## Telegram

Telegram is the implemented surface; see `src/surfaces/telegram/`. Offsets live in `workspace/state/telegram/`. Downloaded media lives in `workspace/media/`. Routes default from configured `telegram.instances`. Commands cover session reset/restore, thinking changes, help, and addressed-agent switching.

## Delivery

Channel sessions do not automatically publish assistant text to a channel. Agents call `send_message(channel="...", text="...")` to deliver to the user.

Private session transcript text stays separate from delivered channel messages.

For operator-driven testing or automation: `shrimpy channels post <channel> <text>` injects a CLI human message into a channel log. Adding `--agent <id>` stamps `origin.addressedAgentId` and routes the turn directly to that agent.
