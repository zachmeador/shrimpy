# 🦐 Prompt Context

Shrimpy assembles stable session prompt text from `PromptSection`s. Each
section has a `kind`, content, and provenance. The assembler orders file-backed
and generated sections, then renders the contained system prompt at session
open.

Per-turn context is separate from the stable system prompt. At turn time Shrimpy
renders live state into a `<context>...</context>` envelope and prefixes the
current user message before Pi persists and sends it. The session file therefore
records the same user turn the model saw.

## Sections

A `PromptSection` (`src/context/resources.ts`) carries:

- `id` — stable identifier for inspection
- `kind` — one of: `identity`, `memory`, `instruction`, `capability`, `runtime`, `activity`, `evidence`
- `content` — the rendered text
- `source` — file path or `inline`/`runtime` for generated content
- `reason` — why this section is here

Rendered sections start with a lightweight marker:

```text
[context base:SOUL.md identity]
```

The completed stable prompt ends with `[end context]`.

Shrimpy prepends one compact immutable system-instruction section before
resource-backed sections load from disk via `assemblePromptResourceSections`.
Workspace files cannot edit or delete it. This is the only immutable
instruction slot Shrimpy adds; other model-facing guidance comes from normal
context assembly for files, skills, runtime sections, and turn context.
Generated Shrimpy session sections such as runtime environment and delivery
hints are built by context services. Available skills still use Pi's
`<available_skills>` formatter, but Shrimpy places that block as a generated
section in the contained system prompt renderer. Pi-style date and cwd facts are also generated
as a runtime section. Turn-scoped command sources are inspected through
the same context configuration, but they render into the per-turn envelope
instead of the stable system prompt.

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

String sources ending in `/` are directory sources. They load top-level `.md` files in deterministic order. Subdirectories are skipped so `agent:context/` loads `context/*.md` without also loading turn-scoped files under `context/people/`, `context/channels/`, or journal subdirectories.

Command sources are turn-scoped. Their output is clipped by `maxChars`, can be channel-filtered with `channels`, and is inspectable with `shrimpy context sources run <id>`. Pass `--session-type <type>` to preview the same `SHRIMPY_CONTEXT_SESSION_TYPE` value a runtime turn would expose.

Channel- or agent-specific overrides live under `context.channels`, `context.agents.<id>`, and `context.agents.<id>.channels`.

## Ordering

Sections are sorted by kind at assembly time. The order (`PROMPT_SECTION_KIND_ORDER` in `src/context/resources.ts`):

1. `identity` — compact immutable system instructions, workspace, system, user, and agent identity docs
2. `memory` — agent context files
3. `instruction` — extra system prompt additions
4. `capability` — Shrimpy-owned capability guidance
5. `runtime` — environment facts, delivery hints
6. `activity` — stable activity sections when present
7. `evidence` — inspectable evidence sections

Stable runtime facts land near the end of the Shrimpy base prompt. The
contained system prompt renderer then appends generated skill and Pi runtime-fact sections. Shrimpy's
Pi resource loader passes the base prompt to Pi, and a Shrimpy
`before_agent_start` hook replaces Pi's built prompt with the contained
system prompt before model calls. `shrimpy context` uses the same renderer
for preview.

## Turn Context Injection

Per turn, `buildTurnContext` (`src/context/turn/service.ts`) gathers live
facts and `renderTurnContext` renders the body:

```text
[turn-context]
time: 2026-04-29T12:00:00Z
agent: shrimpy
session: gateway channel: home
- gateway status: last watch run 5m ago; next watch run in 10m
  inspect: shrimpy gateway status
- home: 3 new messages since this agent last handled it
  inspect: shrimpy channels read home --after <message-id>

## Memory Context

### channel:home
project notes from agents/shrimpy/context/channels/home.md

### peer:human:alice
working notes from agents/shrimpy/context/people/human:alice.md
```

`formatPromptWithTurnContext` wraps that rendered text in `<context>` tags with
a short instruction, then appends the current user prompt body. Shrimpy's Pi
extension uses `before_agent_start`, `message_end`, and `agent_end` hooks to
rewrite the finalized user message before Pi persists and sends it:

```text
<context>
[turn-context]
...
</context>

The context above is background for the user message below. Answer the user
message below using this context when relevant.

[channel: home, sender: human:alice]
...
```

The context envelope and final channel/user prompt body are persisted together.
This keeps direct TUI, direct `run`, gateway channel, and child-session behavior
aligned while keeping the stable system prompt cacheable.

The memory context block is built by `buildMemoryContext` (`src/memory/context.ts`). It reads path-indexed files for the active turn:

- `context/people/<sender>.md`
- `context/channels/<channel>.md`

Missing files emit nothing. There is no heading parser, derived peer card, or framework-owned memory writer.

Per-agent turn-context state under `runtime/context/` records what the agent has already seen so the next turn surfaces only new channel-unread pointers.

## Inspection

```bash
shrimpy context --agent shrimpy                 # rendered system prompt
shrimpy context --agent shrimpy --json          # includes contained systemPrompt and base shrimpySystemPrompt
shrimpy context --agent shrimpy --sections      # section manifest with provenance
shrimpy context --agent shrimpy --sections --json
shrimpy context --turn --channel home           # full preview with separate turn context and user message
shrimpy context turn --agent shrimpy --channel home
shrimpy context sources list --agent shrimpy --channel home --json
shrimpy context sources run runtime:turn-context --agent shrimpy --channel home
```

`--sections --json` returns each section's id, kind, source, reason, and length.
`--turn --json` includes `turnContext` and `userMessage` as separate fields.
