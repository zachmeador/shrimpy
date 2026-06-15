# Watches

Use a watch for recurring attention: reminders, briefings, upkeep, audits, monitors, and periodic checks.

Default shape: an agent-owned message watch that posts one concise instruction into a real channel. Choose the owner agent, cadence, channel, and expected result before adding it.

Inspect first:

```bash
shrimpy watches --agent <id>
shrimpy channels members <channel>
shrimpy agent channel-policy <id> --channel <channel>
shrimpy watches show <agent-id>/<watch-id>
shrimpy watches history <agent-id>/<watch-id>
```

Add or toggle:

```bash
shrimpy watches add <id> --agent <id> --cron "<expr>" --channel <channel> --message "<instruction>"
shrimpy watches add <id> --agent <id> --every 2h --channel <channel> --message "<instruction>"
shrimpy watches add <id> --agent <id> --every 30m --command "<command>" --emit-policy on_failure --emit-channel <channel>
shrimpy watches enable <agent-id>/<watch-id>
shrimpy watches disable <agent-id>/<watch-id>
shrimpy watches run <agent-id>/<watch-id>
shrimpy watches history <agent-id>/<watch-id> --limit 20
```

Do not hide recurring work. Tell the user when it runs, what model it will use, where it posts, and how to disable it.

More detail: `reference/configuration.md`, `reference/runtime.md`, `reference/channels.md`, `reference/cli.md`.
