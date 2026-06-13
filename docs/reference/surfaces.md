# 🦐 Surfaces

Surfaces translate outside interaction into Shrimpy channels and translate Shrimpy channel replies back to the outside world. Transport details live at the edge; typed channel messages live inside. Channel protocol, membership, addressing, and egress semantics live in [channels.md](channels.md).

## Addressing

Surfaces may set `origin.addressedAgentId` on a message. Addressing is a surface/user-facing affordance and an input to each visible agent's channel policy; it does not route around channel membership. Watch-origin messages use ordinary channel membership and agent channel policy too.

Surface users can be mapped to stable Shrimpy user ids so peer cards and agent channel policy do not depend on transport-specific ids.

This supports a one-visible-account pattern:

- the user sees one bot/account
- the surface tracks the currently addressed internal agent for that thread
- plain follow-up messages carry that addressed-agent metadata
- channel membership stays stable

`shrimpy surface` inspects and edits addressed-agent state. Switching a surface thread to an agent joins that agent to the resolved surface channel when needed, and writes a `surface_addressing` status entry into the channel log. The status entry is informational; it does not wake agents by itself.

## Surface verticals

Each surface lives in its own folder under `src/surfaces/<name>/`. The folder owns:

- `client.ts` — third-party network client
- `poller.ts` (or equivalent) — real-time listener if the transport needs lifecycle
- `bridge.ts` — translates inbound transport messages into the typed channel protocol
- `outbound.ts` — markdown → surface format + chunking
- `commands.ts` — surface-specific command parser/dispatcher
- `config.ts` — config schema, instance resolver, and default-agent helpers
- `surface.ts` — `SurfaceEgress` and `GatewaySurface` lifecycle wiring
- `index.ts` — exports the `ChatSurfaceModule` registered in `src/surfaces/index.ts`

Shared primitives live in `src/surfaces/shared/`: `ChatSurfacePublisher`, `PendingByThread`, `mergeChatTextBurst`, `SurfaceThreadStateStore`, the `ChatSurfaceModule` interface, and the `SurfaceEgress` / `GatewaySurface` types.

A new surface is a `surfaces/<name>/` folder appended to the array in `src/surfaces/index.ts`. `AppRuntime` iterates the registry to resolve config, register egress senders, and route channels to default agents.

## Telegram

Telegram is the implemented surface; see `src/surfaces/telegram/`. Offsets live in `workspace/state/telegram/`. Downloaded media lives in `workspace/media/`. Telegram channel names are transport-thread channels in the form `telegram~<instance-id>~<chat-id>` and carry a manifest binding like `telegram/<instance-id>/<chat-id>` in `config/channels.json`. Create normal semantic channels for internal work, and use `shrimpy channels bind <channel> telegram/<instance-id>/<chat-id>` when a semantic channel should deliver to Telegram. Use `shrimpy setup telegram` plus `shrimpy surface set-agent` for addressed-agent routing instead of inventing adapter-shaped channel names. Commands cover session reset/restore/stop, thinking changes, help, and addressed-agent switching.

Every Telegram instance must configure `allowedChatIds` with at least one numeric Telegram chat ID. Missing or empty allowlists are invalid, and unauthorized inbound updates are dropped before channel logs, bindings, identities, presence, commands, media downloads, or model wake. `shrimpy setup telegram` can poll Telegram directly for candidate IDs, so the gateway does not need to run open for discovery.

Telegram sends best-effort native typing activity while an accepted gateway turn is running. Activity is ephemeral surface state: it is not appended to channel logs, and ignored messages or surface commands do not emit it. `shrimpy surface activity <channel> --kind typing --duration <seconds>` can trigger a short activity window for manual checks.

Inbound Telegram messages from known users update `state/user-presence.json` with that user's last active surface channel. `send_message(channel="user:<id>", text="...")` and `shrimpy channels post user:<id> ...` resolve the alias to the concrete last-active surface channel at send time.

## Delivery

Gateway/channel sessions do not automatically publish assistant text to a channel. Agents call active-channel helpers such as `reply(text)`, `ask(text)`, `notify(text, opts)`, or `report(summary)` to deliver intentional user-facing text.

Those helpers append typed channel messages first. The gateway outbox tails channel logs, sends outbound-eligible agent/system text, media, and operation-status acknowledgements through the registered surface instance, and records delivery receipts under `runtime/`. Channel control records, system records, and informational statuses stay inspectable in the channel log. `shrimpy channels show <channel>` reports the manifest binding and undelivered receipt count.

Direct local sessions such as `tui` and `run` are different: ordinary assistant text is already visible in the session transcript, so active-channel publication helpers are not part of that response path.

`send_message(channel="...", text="...")` remains available for explicit routing and unusual cases, including agent DMs. It should not be used to answer the current direct TUI/run conversation.

Private gateway session transcript text stays separate from delivered channel messages.

For operator-driven testing or automation: `shrimpy channels post <channel> <text>` injects a CLI human message into a channel log. Adding `--agent <id>` stamps `origin.addressedAgentId`; the addressed agent still needs channel visibility and a policy that wakes for it.
