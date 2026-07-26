# 🦐 Context

Shrimpy controls everything the model sees in a session: a stable system prompt assembled at session open, plus live per-turn facts injected alongside each user message. Stable material comes from Markdown files selected by config; per-turn material is generated at turn time. Keeping live facts out of the system prompt keeps prompt caching effective.

## Stable Sources

`context.sources` in `config/shrimpy.json` is the ordered source list. The defaults are `workspace:context/`, `agent:SOUL.md`, and `agent:context/`.

```jsonc
{
  "context": {
    "sources": [
      "workspace:context/",
      "agent:SOUL.md",
      "agent:context/"
    ]
  }
}
```

- `workspace:<path>` resolves from the workspace root; `agent:<path>` resolves from the active agent's root.
- Sources ending in `/` are directory sources: every Markdown file under the tree loads recursively in deterministic path order. The default `workspace:context/` loads `context/SYSTEM.md`, `context/USER.md`, `context/WORKSPACE.md`, and anything else below workspace `context/`.
- `context.agents.<id>` and `context.agents.<id>.channels.<pattern>` scope sources to one agent or one agent/channel pair.

Stable source lists accept only `workspace:` and `agent:` resource strings. Executable objects are rejected in base, agent, and channel source lists.

## The System Prompt

The stable prompt is assembled from typed `PromptSection`s. Each section carries an `id`, a `kind`, rendered `content`, a `source` path (or `inline`/`runtime` for generated content), and a `reason`. Rendered sections wrap their content in a compact XML-style path wrapper:

```text
<context path="/home/alice/.shrimpy/agents/shrimpy/SOUL.md">
...
</context>
```

Sections sort by kind: `identity`, `memory`, `instruction`, `capability`, `runtime`, `activity`, `evidence`. Stable identity and memory lead; environment facts land near the end.

Shrimpy-owned behavioral copy resolves from `src/instructions/`, where each definition has a semantic instruction id and a typed renderer for runtime values. Runtime prompt sections retain that id when applicable. Workspace context, agent identities and memory, caller additions, and skill contents remain owned by their respective files rather than entering the product catalog.

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
- high-confidence workspace knowledge paths related to the incoming message
- output from configured `context.turn.producers`

Per-agent state under `runtime/context/` records channel-unread progress and cached producer output. Producer caches are isolated by producer id, channel, and session type.

### Delivery

Every model request places turn context before the associated user prompt. The two session paths persist that input differently, and both forms are durable and participate in later model context:

- **Gateway turns** prefix the rendered context to the routed channel prompt, add a short instruction associating the context with the message, and persist it all as one user message.
- **Direct sessions** (TUI, `run`) persist the submitted user message unchanged, then follow it with a `shrimpy_turn_context` custom message. Before each model request Shrimpy folds that attachment ahead of its user prompt. The custom message stays collapsed in the transcript until Ctrl+O expands turn details; session previews keep the unchanged submitted message alongside the normalized model context.

### Config

```json
{
  "context": {
    "turn": {
      "maxChars": 2000,
      "producers": [
        {
          "id": "finance_alerts",
          "run": "finance-shrimpy alerts context",
          "when": {
            "channels": ["maintenance", "finance"]
          },
          "timeoutMs": 5000,
          "cacheMs": 60000,
          "maxChars": 1200
        }
      ],
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

### Workspace Knowledge

Workspace knowledge breadcrumbs connect incoming message text to `shrimpy workspace search`. Results are deduplicated by path, and each item includes a path-and-line inspection pointer; document bodies never enter turn context.

The lookup uses the automatically maintained local index described in [workspace.md](workspace.md#search). See [configuration.md](configuration.md#workspace-knowledge-breadcrumbs) for workspace-wide ranking controls.

### Automatic Producers

`context.turn.producers` contains bounded commands that Shrimpy runs automatically before matching live turns. `run` is the shell command, `timeoutMs` bounds execution time, `maxChars` clips its stdout, and `cacheMs` controls how long the parsed output is reused. Producer output can be plain lines, one JSON item, a JSON item array, or an object with an `items` array.

`when.channels` is an applicability condition. A producer without `when.channels` matches both channel and channel-less sessions. A producer with `when.channels` runs only when a named session channel matches one of its patterns; direct, TUI, and other channel-less sessions do not match it. Preview commands do not automatically execute configured producers.

Automatic producers should be reserved for bounded facts the model must see before it can decide what to inspect. Prefer an agent-invoked CLI command or tool when the model can decide whether live data is relevant.

## Inspection

```bash
shrimpy context --agent shrimpy "hello" --json  # context for a direct turn
shrimpy context --channel home "hello" --json   # context for a channel turn
shrimpy context --session local/main "hello" --json
shrimpy context --agent shrimpy --sections
shrimpy context --turn --channel home
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home
shrimpy context sources run directory:workspace:context/ --agent shrimpy
shrimpy context producers list --agent shrimpy --channel finance
shrimpy context producers run finance_alerts --agent shrimpy --channel finance
```

The main command opens the same session as a real run. With `--json`, `context` shows exactly what Pi sends to the model: the system prompt, messages, and available tools.

`--session <canonical-id>` copies the active, compaction-aware transcript into memory before inspecting the next turn. The source transcript is not opened for writing, and the JSON `historyMessageCount` identifies the messages that came from stored history. `--session` and `--channel` are mutually exclusive.

Inspection does not persist a turn or change producer freshness. Configured automatic producers are reported as skipped and are not executed; use `context producers run` when execution is intentional. `producers list` reports match and cache status without execution. `producers run` accepts `--session-type <type>` and does not update automatic-turn cache state.

## Related Code

- Section types and kind order: `src/context/resources.ts`
- Turn-context builder: `src/context/turn/builder.ts`
