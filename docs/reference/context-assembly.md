# 🦐 Prompt Context

Shrimpy assembles the agent's prompt from `PromptSection`s. Each section has a `kind`, content, and provenance. The assembler orders sections, renders them into one system prompt at session open, and prepends a per-turn `<context>...</context>` envelope at turn time.

## Sections

A `PromptSection` (`src/context/resources.ts`) carries:

- `id` — stable identifier for inspection
- `kind` — one of: `identity`, `memory`, `instruction`, `capability`, `runtime`, `activity`, `evidence`
- `content` — the rendered text
- `source` — file path or `inline`/`runtime` for generated content
- `reason` — why this section is here

Resource-backed sections load from disk via `assemblePromptResourceSections`. Generated sections such as runtime environment, delivery hints, available skills, and turn context are built by context services.

## Source Configuration

`context.sources` in `shrimpy.json` is an ordered list of context sources:

```jsonc
{
  "context": {
    "sources": [
      "workspace:profile/WORKSPACE.md",
      "workspace:profile/SYSTEM.md",
      "agent:SOUL.md",
      "workspace:profile/USER.md",
      "agent:context/",
      {
        "type": "command",
        "id": "finance_alerts",
        "command": "finance-shrimpy alerts briefing",
        "channels": ["heartbeat", "finance"],
        "timeoutMs": 5000,
        "maxChars": 1200,
        "freshForMs": 60000
      }
    ]
  }
}
```

String sources use resource addresses:

- `workspace:<path>` — relative to the workspace root
- `agent:<path>` — relative to the active agent's directory

String sources ending in `/` are directory sources. They load top-level `.md` files in deterministic order. Subdirectories are skipped so `agent:context/` loads `context/*.md` without also loading turn-scoped files under `context/people/`, `context/channels/`, or journal subdirectories.

Command sources are turn-scoped. Their output is clipped by `maxChars`, can be channel-filtered with `channels`, and is inspectable with `shrimpy context sources run <id>`.

Channel- or agent-specific overrides live under `context.channels`, `context.agents.<id>`, and `context.agents.<id>.channels`.

## Ordering

Sections are sorted by kind at assembly time. The order (`PROMPT_SECTION_KIND_ORDER` in `src/context/resources.ts`):

1. `identity` — workspace, system, user, and agent identity docs
2. `memory` — agent context files
3. `instruction` — extra system prompt additions
4. `capability` — available skill list
5. `runtime` — environment facts, delivery hints
6. `activity` — turn context items
7. `evidence` — inspectable evidence sections

Live state lands at the end of the prompt — closest to the model's most recent context.

## Turn Envelope

Per turn, the prompt body is prefixed with a `<context>...</context>` block from `buildTurnContext` (`src/context/turn/service.ts`):

```text
<context>
[briefing]
time: 2026-04-29T12:00:00Z
agent: shrimpy
session: gateway channel: home
- gateway status: last scheduled run 5m ago; next scheduled run in 10m
  inspect: shrimpy gateway status
- home: 3 new messages since this agent last handled it
  inspect: shrimpy channels read home --after <message-id>

## Memory Briefing

### channel:home
project notes from agents/shrimpy/context/channels/home.md

### peer:human:alice
working notes from agents/shrimpy/context/people/human:alice.md
</context>

[channel: home, sender: human:alice]
...
```

The memory briefing block is built by `buildMemoryBriefing` (`src/memory/briefing.ts`). It reads path-indexed files for the active turn:

- `context/people/<sender>.md`
- `context/channels/<channel>.md`

Missing files emit nothing. There is no heading parser, derived peer card, or framework-owned memory writer.

Per-agent turn-context state under `runtime/briefings/` records what the agent has already seen so the next turn surfaces only new channel-unread pointers.

## Inspection

```bash
shrimpy context --agent shrimpy                 # rendered system prompt
shrimpy context --agent shrimpy --sections      # section manifest with provenance
shrimpy context --agent shrimpy --sections --json
shrimpy context --briefing --channel home       # turn-context envelope only
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home --json
shrimpy context sources run runtime:turn-context --agent shrimpy --channel home
```

`--sections --json` returns each section's id, kind, source, reason, and length.
