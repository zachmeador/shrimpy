# 🦐 Turn Context

Turn context is generated live state, prepended to the user message in a `<context>...</context>` envelope.

The runtime labels the rendered header `[turn-context]`, and the public API is `shrimpy context`.

## Shape

A turn-context item carries a summary line and an optional inspect command:

```json
{
  "summary": "home: 3 new messages since this agent last handled it",
  "inspect": "shrimpy channels read home --after <message-id>"
}
```

## Defaults

Shrimpy includes:

- current turn metadata in the header
- gateway status pointers such as scheduled-run recency, next run time, and latest user interaction
- channel unread summaries for matching channels
- path-indexed memory slices from `context/people/<sender>.md` and `context/channels/<channel>.md`
- workspace-configured command sources from `context.sources`

Command sources let workspace-specific agents add their own alerts. For example, a finance agent can expose `finance-shrimpy alerts context` and Shrimpy includes its output for selected channels.

Command output is compact text. Use evidence or inspect commands inside that text when the agent should know how to drill down.

## Config

```json
{
  "context": {
    "turn": {
      "maxChars": 2000,
      "channelUnread": {
        "enabled": true,
        "channels": ["*"],
        "includeLatest": true
      },
      "sessionStatus": {
        "enabled": true,
        "staleAfterMinutes": 720
      }
    },
    "sources": [
      "workspace:profile/WORKSPACE.md",
      "workspace:profile/SYSTEM.md",
      "agent:SOUL.md",
      "workspace:profile/USER.md",
      "agent:context/",
      {
        "type": "command",
        "id": "finance_alerts",
        "command": "finance-shrimpy alerts context",
        "channels": ["heartbeat", "finance"],
        "timeoutMs": 5000,
        "maxChars": 1200,
        "freshForMs": 60000
      }
    ]
  }
}
```

`context.turn.maxChars` controls the total rendered turn-context budget. `context.turn.sessionStatus` controls scheduled-turn session recency pointers. Command-source `freshForMs` controls how long Shrimpy may reuse command output before running the command again. Preview runs do not update freshness state.

## Inspection

```bash
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home
shrimpy context sources run finance_alerts --agent shrimpy --channel finance
```
