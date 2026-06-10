---
name: channel-routing
description: Use when configuring or debugging Shrimpy channels, channel policies, chat surfaces, Telegram routing, or surface-thread agent assignment.
---

# Channel Routing

Use this mechanic-owned skill when the user asks how a message reaches an agent, when adding a chat surface, or when an agent should participate in a channel.

Reference docs, under the Shrimpy docs path listed in workspace context:

- `reference/channels.md` — channel logs, membership, wake policy, addressed messages.
- `reference/surfaces.md` — chat surface adapters, Telegram setup, surface-thread routing.
- `reference/cli.md` — current `shrimpy channels`, `shrimpy surface`, and `shrimpy setup telegram` commands.

## How To Work

1. Decide whether the user wants an internal Shrimpy room/log, an external chat binding, or both.
2. For internal rooms, use normal semantic channel names like `fitness`, `maintenance`, or `home`.
3. For external chat surfaces, inspect the configured surface and real thread ids before editing bindings.
4. Join agents to channels with `shrimpy channels join <channel> --agent <id> --json`.
5. Inspect wake policy with `shrimpy agent channel-policy <id> --channel <channel> --json` and `shrimpy agent channel-policy explain <id> --channel <channel> --sender human --text "..." --json`.
6. Assign default addressed agents for surface threads with `shrimpy surface set-agent <surface> <thread-id> <agent> --json`.
7. Restart the gateway after Telegram config changes.

## Guardrails

- Channels are shared rooms and logs. Sessions carry instructions. Surfaces bridge external chats into channels.
- Surface-thread channels are transport-bound channels, not agent concepts. Telegram channels look like `telegram~<instance-id>~<chat-id>` where the instance comes from `config/shrimpy.json` and the chat id comes from real Telegram traffic.
- Semantic channels can deliver externally through `shrimpy channels bind <channel> telegram/<instance-id>/<chat-id>`.
- Do not invent adapter-shaped names like `telegram~fitness` to mean "a Telegram channel for the fitness agent."
- Do not hand-edit surface state when a CLI command covers the route.
- If a route is unclear, inspect before changing it: `shrimpy channels`, `shrimpy channels show <name>`, `shrimpy channels members <name> --json`, `shrimpy surface`, and `shrimpy surface threads <surface> --json`.
