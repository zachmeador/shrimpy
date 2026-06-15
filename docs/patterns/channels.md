# Channels

Use channels for routing and logs. Sessions carry instructions; channels hold the messages that humans, agents, watches, and surfaces exchange.

Inspect before changing routing:

```bash
shrimpy channels
shrimpy channels show <channel>
shrimpy channels members <channel>
shrimpy channels read <channel> --limit 20
shrimpy channels tail <channel>
shrimpy channels search <channel> "<query>" --limit 20
shrimpy agent channel-policy <id> --channel <channel>
shrimpy agent channel-policy explain <id> --channel <channel> --sender human --text "<message>"
```

Use user-facing channels for conversations, maintenance/log channels for background work, and app/workflow channels when a recurring process needs its own durable trace. Surface-thread channels are transport-bound channels, not agent concepts. Telegram channels look like `telegram~<instance-id>~<chat-id>` where both ids come from real configured surface state.

Create or route deliberately:

```bash
shrimpy channels create <channel>
shrimpy channels join <channel> --agent <id>
shrimpy channels post <channel> --agent <id> "<message>"
shrimpy channels dm <agent-a> <agent-b>
shrimpy channels bind <channel> <adapter>/<instance>/<thread>
shrimpy channels unbind <channel>
```

Do not invent adapter-shaped channel names by hand. Configure surfaces through their setup commands and bind real channels only when the transport exists.

More detail: `reference/channels.md`, `reference/surfaces.md`, `reference/cli.md`.
