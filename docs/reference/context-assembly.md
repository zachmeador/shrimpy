# 🦐 Context

Shrimpy controls everything the model sees in a session: a stable system prompt assembled at session open, plus live per-turn facts injected alongside each user message. Stable material comes from Markdown files selected by config; per-turn material is generated at turn time. Keeping live facts out of the system prompt keeps prompt caching effective.

## Sources

`context.sources` in `config/shrimpy.json` is the ordered source list. The defaults are `workspace:context/`, `agent:SOUL.md`, and `agent:context/`.

```jsonc
{
  "context": {
    "sources": [
      "workspace:context/",
      "agent:SOUL.md",
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

- `workspace:<path>` resolves from the workspace root; `agent:<path>` resolves from the active agent's root.
- Sources ending in `/` are directory sources: every Markdown file under the tree loads recursively in deterministic path order. The default `workspace:context/` loads `context/SYSTEM.md`, `context/USER.md`, `context/WORKSPACE.md`, and anything else below workspace `context/`.
- Command sources run at turn time and emit compact text: clipped by `maxChars`, optionally filtered by `channels`, and cached for `freshForMs` before the command runs again.
- `context.agents.<id>` and `context.agents.<id>.channels.<pattern>` scope sources to one agent or one agent/channel pair.

## The System Prompt

The stable prompt is assembled from typed `PromptSection`s. Each section carries an `id`, a `kind`, rendered `content`, a `source` path (or `inline`/`runtime` for generated content), and a `reason`. Rendered sections wrap their content in a compact XML-style path wrapper:

```text
<context path="/home/alice/.shrimpy/agents/shrimpy/SOUL.md">
...
</context>
```

Sections sort by kind: `identity`, `memory`, `instruction`, `capability`, `runtime`, `activity`, `evidence`. Stable identity and memory lead; environment facts land near the end.

The **contained system prompt** is the final prompt Shrimpy hands to the model: the sorted sections plus generated sections for Pi's `<available_skills>` block and Pi-style date/cwd facts. Shrimpy passes its base prompt to Pi at session setup, then replaces Pi's built prompt with the contained system prompt before model calls.

## Turn Context

Turn context is generated live state for one model turn. Each item is a summary line with an optional inspect command:

```text
[turn-context]
time: Wed, 04/29/2026, 08:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T12:00:00.000Z
agent: shrimpy
session: gateway channel: home
- gateway status: last watch run 5m ago; next watch run in 10m
  inspect: shrimpy gateway status
- home: 3 new messages since this agent last handled it
  inspect: shrimpy channels read home --after <message-id>
```

Shrimpy includes by default:

- turn metadata in the header
- gateway status pointers: watch-run recency, next run time, latest user interaction
- the active agent's watch inventory, capped and ordered around active runs, nearest due watches, and recent runs
- owned worker outcomes: current-session workers first, current-channel workers next, then compact counts for other workers needing review, with `shrimpy worker read <id>` as the inspect command
- channel unread summaries for matching channels
- command-source output from `context.sources`

Per-agent state under `runtime/context/` records what the agent has already seen, so each turn surfaces only new channel-unread pointers.

### Delivery

The two session paths persist turn context differently, and both forms are durable and participate in later model context:

- **Gateway turns** prefix the rendered context to the routed channel prompt, add a short instruction associating the context with the message, and persist it all as one user message.
- **Direct sessions** (TUI, `run`) persist the submitted user message unchanged, then follow it with a `shrimpy_turn_context` custom message. The custom message stays collapsed in the transcript until Ctrl+O expands turn details; session previews use the unchanged user message.

### Config

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
    }
  }
}
```

`context.turn.maxChars` is the total rendered budget. `context.turn.sessionStatus` controls watch-turn session recency pointers.

## Inspection

```bash
shrimpy context --agent shrimpy                 # rendered system prompt
shrimpy context --agent shrimpy --sections      # section manifest with provenance
shrimpy context --turn --channel home           # sections plus the turn-context-prefixed user message
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home
shrimpy context sources run finance_alerts --agent shrimpy --channel finance
```

`--sections --json` returns each section's id, kind, source, reason, and length. `--turn --json` includes `turnContext` and `userMessage` as separate fields. `sources run` accepts `--session-type <type>` to match the `SHRIMPY_CONTEXT_SESSION_TYPE` value a runtime turn would expose; preview runs do not update command-source freshness state.

## Related Code

- Section types and kind order: `src/context/resources.ts`
- Turn-context service: `src/context/turn/service.ts`
