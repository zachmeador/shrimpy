---
name: shrimpy-channels
description: Use when configuring or debugging Shrimpy channels, channel policies, chat surfaces, Telegram routing, or surface-thread agent assignment.
---

# Shrimpy Channels

Use this skill when the user asks how a message reaches an agent, when adding a chat surface, or when an agent should participate in a channel.

Use the paths in `profile/WORKSPACE.md`. For detail, use:

- `reference/channels.md` — channel logs, membership, wake policy, addressed messages.
- `reference/surfaces.md` — chat surface adapters, Telegram setup, surface-thread routing.
- `reference/cli.md` — current `shrimpy channels`, `shrimpy surface`, and `shrimpy setup telegram` commands.

## Correct Channel Use

Channels are shared message logs and routing surfaces. Sessions carry instructions. Channel membership controls which agents can see a channel; each agent's channel policy controls whether a visible message wakes that agent. Surface-thread channels are transport-bound channels, not agent identities.

Use user-facing channels for conversations, `maintenance` or other log channels for background work, and semantic app/workflow channels when a recurring process needs a durable trace. Do not create adapter-shaped channel names by hand. Telegram channels look like `telegram~<instance-id>~<chat-id>` only when they come from real configured surface state.

## How To Work

1. Decide whether the user wants an internal Shrimpy room/log, an external chat binding, or both.
2. Inspect existing channels, members, and policy before changing routing.
3. For external chat surfaces, inspect the configured surface and real thread ids before editing bindings.
4. Join agents to channels with `shrimpy channels join <channel> --agent <id> --json`.
5. Inspect wake policy with `shrimpy agent channel-policy <id> --channel <channel>` and `shrimpy agent channel-policy explain <id> --channel <channel> --sender human --text "..." --json`.
6. Assign default addressed agents for surface threads with `shrimpy surface set-agent <surface> <thread-id> <agent> --json`.
7. Restart the gateway after Telegram config changes.

## Commands

```bash
shrimpy channels
shrimpy channels show <channel>
shrimpy channels members <channel>
shrimpy channels read <channel> --limit 20
shrimpy channels search <channel> "<query>" --limit 20
shrimpy channels create <channel>
shrimpy channels join <channel> --agent <id> --json
shrimpy channels post <channel> --agent <id> "<message>"
shrimpy channels dm <agent-a> <agent-b>
shrimpy channels bind <channel> <adapter>/<instance>/<thread>
shrimpy channels unbind <channel>
shrimpy surface
shrimpy surface show <surface> <thread-id>
shrimpy surface set-agent <surface> <thread-id> <agent> --json
```

## Guardrails

- Chat adapters must have explicit inbound whitelists before gateway use. For Telegram, use numeric chat IDs in `allowedChatIds`; usernames, display names, and `users` identity mappings are not authorization. Use `shrimpy setup telegram` to discover IDs without starting the gateway open.
- Semantic channels can deliver externally through `shrimpy channels bind <channel> telegram/<instance-id>/<chat-id>`.
- Do not invent adapter-shaped names like `telegram~fitness` to mean "a Telegram channel for the fitness agent."
- Do not hand-edit surface state when a CLI command covers the route.
- If a route is unclear, inspect before changing it: `shrimpy channels`, `shrimpy channels show <name>`, `shrimpy channels members <name>`, `shrimpy surface`, and `shrimpy surface show <surface> <thread-id>`.
