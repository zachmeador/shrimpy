# 🦐 Prompt Context

Shrimpy assembles stable session prompt text from `PromptSection`s. Each section has a `kind`, content, and provenance. The assembler orders file-backed and generated sections, then renders the contained system prompt at session open.

Per-turn context is separate from the stable system prompt. For direct Pi sessions, Shrimpy persists the submitted user message unchanged and follows it with a model-visible custom context message. Gateway turns persist the rendered context and routed prompt body together in one user message.

## Sections

A `PromptSection` (`src/context/resources.ts`) carries:

- `id` — stable identifier for inspection
- `kind` — one of: `identity`, `memory`, `instruction`, `capability`, `runtime`, `activity`, `evidence`
- `content` — the rendered text
- `source` — file path or `inline`/`runtime` for generated content
- `reason` — why this section is here

Rendered sections use compact XML-style path wrappers:

```text
<context path="/home/alice/.shrimpy/agents/shrimpy/SOUL.md">
...
</context>
```

Resource-backed sections load from disk via `assemblePromptResourceSections`. Generated Shrimpy session sections such as runtime environment and delivery hints are built by context services. Available skills still use Pi's `<available_skills>` formatter, but Shrimpy places that block as a generated section in the contained system prompt renderer. Pi-style date and cwd facts are also generated as a runtime section. Turn-scoped command sources are inspected through the same context configuration, but they render into the per-turn user message instead of the stable system prompt.

## Source Configuration

`context.sources` in `shrimpy.json` is an ordered list of context sources:

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

String sources use resource addresses:

- `workspace:<path>` — relative to the workspace root
- `agent:<path>` — relative to the active agent's directory

Use `workspace:context/` for shared workspace context and `agent:context/` for the active agent's own memory. Source overrides decide whether a workspace context file applies to every agent, one agent, one channel pattern, or a specific agent/channel pair.

String sources ending in `/` are directory sources. They load every Markdown file under that directory recursively in deterministic path order. The default `workspace:context/` source loads `context/SYSTEM.md`, `context/USER.md`, `context/WORKSPACE.md`, and any other Markdown below workspace `context/`; the default `agent:context/` source loads any Markdown below the active agent's `context/` tree.

Command sources are turn-scoped. Their output is clipped by `maxChars`, can be channel-filtered with `channels`, and is inspectable with `shrimpy context sources run <id>`. Pass `--session-type <type>` to use the same `SHRIMPY_CONTEXT_SESSION_TYPE` value a runtime turn would expose.

Channel- or agent-specific overrides live under `context.channels`, `context.agents.<id>`, and `context.agents.<id>.channels`.

## Ordering

Sections are sorted by kind at assembly time. The order (`PROMPT_SECTION_KIND_ORDER` in `src/context/resources.ts`):

1. `identity` — workspace baseline context and agent identity docs
2. `memory` — agent context files
3. `instruction` — extra system prompt additions
4. `capability` — Shrimpy-owned capability guidance
5. `runtime` — environment facts, delivery hints
6. `activity` — stable activity sections when present
7. `evidence` — inspectable evidence sections

Stable runtime facts land near the end of the Shrimpy base prompt. The contained system prompt renderer then appends generated skill and Pi runtime-fact sections. Shrimpy's Pi resource loader passes the base prompt to Pi, and a Shrimpy `before_agent_start` hook replaces Pi's built prompt with the contained system prompt before model calls. `shrimpy context` is the inspection surface for the model-facing context assembled for an agent/session/turn.

## Turn Context Injection

Per turn, `buildTurnContext` (`src/context/turn/service.ts`) gathers live facts and `renderTurnContext` renders the body:

```text
[turn-context]
time: Wed, 04/29/2026, 08:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T12:00:00.000Z
agent: shrimpy
session: gateway channel: home
- gateway status: last watch run 5m ago; next watch run in 10m
  inspect: shrimpy gateway status
- watches: 3 configured; shrimpy/memory-management local=memory-management enabled 0 3 * * * channels=maintenance next=in 4h last=success 1d ago
  inspect: shrimpy watches --agent shrimpy
- home: 3 new messages since this agent last handled it
  inspect: shrimpy channels read home --after <message-id>
```

Gateway delivery uses `prefixPromptWithTurnContext` to prefix that rendered text, add a short instruction, and append the routed user prompt body:

```text
[turn-context]
...

The turn context above is background for the user message below. Answer the user message below using this context when relevant.

[channel: home, sender: human:alice]
...
```

Direct TUI, direct `run`, and other direct Pi sessions instead use a `before_agent_start` extension hook. It preserves the submitted user message and follows it with a `shrimpy_turn_context` custom message containing the model-facing context instruction. The custom message consumes no transcript rows while collapsed and appears when Ctrl+O expands turn details. Both direct and gateway paths keep live context out of the stable system prompt so prompt caching remains effective.

Agent memory Markdown is loaded through configured file and directory sources, not a separate turn-memory loader. There is no heading parser, derived peer card, or framework-owned memory writer.

Per-agent turn-context state under `runtime/context/` records what the agent has already seen so the next turn surfaces only new channel-unread pointers.

## Inspection

```bash
shrimpy context --agent shrimpy                 # rendered system prompt
shrimpy context --agent shrimpy --json          # includes contained systemPrompt and base shrimpySystemPrompt
shrimpy context --agent shrimpy --sections      # section manifest with provenance
shrimpy context --agent shrimpy --sections --json
shrimpy context --turn --channel home           # prompt sections plus turn-context-prefixed user message
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home --json
shrimpy context sources run runtime:turn-context --agent shrimpy --channel home
```

`--sections --json` returns each section's id, kind, source, reason, and length. `--turn --json` includes `turnContext` and `userMessage` as separate fields.
