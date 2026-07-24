# 🦐 Surfaces

Surfaces translate outside interaction into Shrimpy channels and translate Shrimpy channel replies back to the outside world. Transport details live at the edge; typed channel messages live inside. Channel protocol, membership, addressing, and egress semantics live in [channels.md](channels.md).

## Addressing

Surfaces may set `origin.addressedAgentId` on a message, and surface users can be mapped to stable Shrimpy user ids so agent channel policy does not depend on transport-specific ids. Addressing semantics and the one-visible-account pattern live in [channels.md](channels.md).

`shrimpy surface` inspects and edits addressed-agent state. Switching a surface thread to an agent joins that agent to the resolved surface channel when needed, and writes an informational `surface_addressing` status entry into the channel log.

## Surface verticals

Each surface lives in its own folder under `src/surfaces/<name>/`. The folder owns:

- `client.ts` — third-party network client
- `poller.ts` — surface lifecycle loop and inbound transport listener
- `bridge.ts` — translates inbound transport messages into the typed channel protocol
- `format.ts` — markdown → surface format + chunking
- `outbound.ts` — surface send orchestration and plain-text fallback
- `commands.ts` — surface-specific command parser/dispatcher
- `config.ts` — config schema, instance resolver, and default-agent helpers
- `surface.ts` — `SurfaceEgress` and `GatewaySurface` lifecycle wiring
- `module.ts` — exports the `ChatSurfaceModule` registered in `src/surfaces/registry.ts`

Shared primitives live in `src/surfaces/shared/`: `ChatSurfacePublisher`, `PendingByThread`, `mergeChatTextBurst`, `SurfaceThreadStateStore`, the `ChatSurfaceModule` interface, and the `SurfaceEgress` / `GatewaySurface` types.

Gateway surfaces may expose a shared health snapshot with status `starting`, `healthy`, `retrying`, `stalled`, or `stopped`. Telegram includes completed-poll time, the last received update time when available, consecutive failures, a bounded error message, and stall/restart count. These snapshots are written into the workspace gateway heartbeat and contain no tokens, message text, or user identities.

To add a surface, create a `surfaces/<name>/` folder and append its module to the array in `src/surfaces/registry.ts`. `AppRuntime` iterates the registry to resolve config, register egress senders, and route channels to default agents.

## Telegram

Telegram is the implemented surface; see `src/surfaces/telegram/`. Offsets live in `workspace/state/telegram/`. Downloaded media lives in `workspace/media/`. Telegram-created chat channels use names in the form `telegram~<instance-id>~<chat-id>` and carry a manifest binding like `telegram/<instance-id>/<chat-id>` in `config/channels.json`. Agent-created workflow channels can also deliver to Telegram when bound with `shrimpy channels bind <channel> telegram/<instance-id>/<chat-id>`. Use `shrimpy setup telegram` plus `shrimpy surface set-agent` for addressed-agent routing instead of making up generated-looking channel names. Commands cover session reset/restore/stop, thinking changes, help, and addressed-agent switching.

Prefer a dedicated bot and Telegram instance for each agent that regularly talks with the user, with that agent configured as the instance's `defaultAgentId`. A background or support agent can still send an occasional notice to the user's established primary chat through its concrete channel or the `user:<id>` alias. Telegram labels such a cross-agent message with `📨 Message from <agent>` when its typed sender differs from the instance's default agent; the stored channel text and sender remain unchanged.

Every Telegram instance must configure `allowedChatIds` with at least one numeric Telegram chat ID. Missing or empty allowlists are invalid, and unauthorized inbound updates are dropped before channel logs, bindings, identities, presence, commands, media downloads, or model wake. `shrimpy setup telegram` can poll Telegram directly for candidate IDs, so the gateway does not need to run open for discovery.

Telegram sends best-effort native typing activity while an accepted gateway turn is running. Activity is ephemeral surface state: it is not appended to channel logs, and ignored messages or surface commands do not emit it. `shrimpy surface activity <channel> --kind typing --duration <seconds>` can trigger a short activity window for manual checks.

Inbound Telegram messages from known users update `state/user-presence.json` with that user's last active surface channel. `send_message(channel="user:<id>", text="...")` and `shrimpy channels post user:<id> ...` resolve the alias to the concrete last-active surface channel at send time.

## Delivery

Publication helpers append typed channel messages; the gateway outbox tails channel logs, sends outbound-eligible records through the registered surface instance, and records delivery receipts under `runtime/`. `shrimpy channels show <channel>` reports the manifest binding and undelivered receipt count. Publication and egress semantics live in [channels.md](channels.md).

For operator-driven testing or automation, `shrimpy channels post <channel> [--agent <id>] <text>` injects a CLI human message into a channel log.
