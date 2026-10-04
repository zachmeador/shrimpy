# 🦐 Surfaces

Surfaces translate outside interaction into Shrimpy channels and translate Shrimpy channel replies back to the outside world. Transport details live at the edge; typed channel messages live inside. Channel protocol, membership, addressing, and egress semantics live in [channels.md](channels.md).

## Addressing

Surfaces may set `origin.addressedAgentId` on a message, and surface users can be mapped to stable Shrimpy user ids so agent channel policy does not depend on transport-specific ids. Addressing semantics and the one-visible-account pattern live in [channels.md](channels.md).

`shrimpy surface` inspects and edits addressed-agent state. Switching a surface thread to an agent joins that agent to the resolved surface channel when needed, and writes an informational `surface_addressing` status entry into the channel log.

## Telegram

Telegram is the implemented surface; see `src/surfaces/telegram/`. Offsets live in `workspace/state/telegram/`. Downloaded media lives in `workspace/media/`. Telegram-created chat channels use names in the form `telegram~<instance-id>~<chat-id>` and carry a manifest binding like `telegram/<instance-id>/<chat-id>` in `config/channels.json`. Agent-created workflow channels can also deliver to Telegram when bound with `shrimpy channels bind <channel> telegram/<instance-id>/<chat-id>`. Use `shrimpy setup telegram` to configure the instance's `defaultAgentId`; operators can apply or clear an explicit per-thread override with `shrimpy surface set-agent` or `clear-agent`.

Telegram's remote commands are `/help`, `/status`, `/new`, `/clear`, `/stop`, and `/thinking <level>`. Help and status reply directly without waking an agent or entering channel history. The state-changing commands publish typed session controls for the thread's resolved current agent and return their normal durable operation acknowledgement. `/thinking` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Command-shaped input with invalid arguments or an unknown name is handled at the surface and never becomes an agent prompt. Session restore, agent switching, and model selection remain local CLI and TUI operations.

Prefer a dedicated bot and Telegram instance for each agent that regularly talks with the user, with that agent configured as the instance's `defaultAgentId`. A background or support agent can still send an occasional notice to the user's established primary chat through its concrete channel or the `user:<id>` alias. That explicit outbound send does not change the configured default, a per-thread override, or channel membership. Telegram labels such a cross-agent message with `📨 Message from <agent>` when its typed sender differs from the instance's default agent. Operation statuses use the same header-and-body notice shape with a success or warning icon and an `<operation> status for <agent>` label. Stored channel text, sender, and status data remain unchanged.

Every Telegram instance must configure `allowedChatIds` with at least one numeric Telegram chat ID. It is the chat-level ingress allowlist: it selects which private or group chats Shrimpy listens to, not which individual members of a group may run commands. Missing or empty allowlists are invalid, and unauthorized inbound updates are dropped before channel logs, bindings, identities, presence, commands, media downloads, or model wake. `shrimpy setup telegram` can poll Telegram directly for candidate IDs, so the gateway does not need to run open for discovery.

An allowed one-to-one private chat authorizes remote commands from its matching Telegram user. In an allowed group chat, a sender's numeric Telegram user ID must also appear in the instance's `users` mapping for command access; admitting the room does not authorize every member. Unauthorized command senders receive a generic denial before Shrimpy creates channel bindings, identity links, presence records, status reads, or controls. Setup preserves existing mappings and can add group command user IDs.

Telegram sends best-effort native typing activity while an accepted gateway turn is running. Activity is ephemeral surface state: it is not appended to channel logs, and ignored messages or surface commands do not emit it. `shrimpy surface activity <channel> --kind typing --duration <seconds>` can trigger a short activity window for manual checks.

Inbound Telegram messages from known users update `state/user-presence.json` with that user's last active surface channel. `send_message(channel="user:<id>", text="...")` and `shrimpy channels post user:<id> ...` resolve the alias to the concrete last-active surface channel at send time.

## Delivery

Use [channels.md](channels.md#publication-and-egress) for publication eligibility, transport bindings, and receipts. `shrimpy channels show <channel>` reports the binding and undelivered receipt count.

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

Shared primitives live in `src/surfaces/shared/`: remote command semantics and observational status collection, `ChatSurfacePublisher`, `PendingByThread`, `mergeChatTextBurst`, `SurfaceThreadStateStore`, the `ChatSurfaceModule` interface, and the `SurfaceEgress` / `GatewaySurface` types.

Gateway surfaces may expose a shared health snapshot with status `starting`, `healthy`, `retrying`, `stalled`, or `stopped`. Telegram includes completed-poll time, the last received update time when available, consecutive failures, a bounded error message, and stall/restart count. These snapshots are written into the workspace gateway heartbeat and contain no tokens, message text, or user identities.

To add a surface, create a `surfaces/<name>/` folder and append its module to the array in `src/surfaces/registry.ts`. `AppRuntime` iterates the registry to resolve config, register egress senders, and route channels to default agents.
