# 🦐 Turn Context

Turn context is generated live state for one model turn. Shrimpy renders it as
a `<context>...</context>` envelope and injects it through Pi's provider-bound
context hook immediately before the current user message.

The durable user message is not rewritten and the context envelope is not saved
to the Pi session transcript. The runtime labels the rendered header
`[turn-context]`, and the public API is `shrimpy context`.

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
- gateway status pointers such as watch-run recency, next run time, and latest user interaction
- channel unread summaries for matching channels
- path-indexed memory slices from `context/people/<sender>.md` and `context/channels/<channel>.md`
- workspace-configured command sources from `context.sources`

Command sources let workspace-specific agents add their own alerts. For example, a finance agent can expose `finance-shrimpy alerts context` and Shrimpy includes its output for selected channels.

Command output is compact text. Use evidence or inspect commands inside that text when the agent should know how to drill down.

## Runtime Path

Direct TUI, direct `run`, gateway channel sessions, and child sessions all use
the same session-open hook shape. A session plan provides
`prepareTurnContext`; Shrimpy's Pi extension prepares context in
`before_agent_start`, inserts it during Pi's `context` event, and clears it on
`agent_end`.

Gateway sessions bind the pending context to the exact formatted channel
message being handled, so queued channel turns cannot leak context into one
another.

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
        "channels": ["maintenance", "finance"],
        "timeoutMs": 5000,
        "maxChars": 1200,
        "freshForMs": 60000
      }
    ]
  }
}
```

`context.turn.maxChars` controls the total rendered turn-context budget. `context.turn.sessionStatus` controls watch-turn session recency pointers. Command-source `freshForMs` controls how long Shrimpy may reuse command output before running the command again. Preview runs do not update freshness state.

## Inspection

```bash
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home
shrimpy context sources run finance_alerts --agent shrimpy --channel finance
```
