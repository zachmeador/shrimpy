---
status: review
priority: P2
area: Context
depends_on:
  - CTX-013
---

# 🦐 CTX-012: Exact Context Command Parity

## Why

`shrimpy context` is supposed to answer "what exact context will this turn see?" Today it still uses separate inspection paths and can miss material from real sessions. That is a correctness bug in the command, not a separate context surface.

## Current State

- `shrimpy context` resolves and opens an in-memory Pi session through the same `SessionResolver` and session-open path as live turns.
- The inspection capture records the context Pi sends to the model.
- `--session <canonical-id>` clones active compaction-aware history into memory without writing to the source transcript.
- [CTX-009](proposals/ctx-009-context-trace-debug-view.md) describes a broader trace/debug model. This item is narrower: make the user-facing context command exact enough to trust before building a richer trace UI.

## Build

- For a requested agent, session, and turn, make `shrimpy context` show the same context as a real run.
- Use the same session planning/open path as real sessions wherever possible. Avoid duplicating prompt, tool, or turn-context assembly just for inspection output.
- Keep text output readable and compact. Put full structured payloads behind `--json` or an explicit inspect mode if needed.
- Preserve the existing section/source inspection commands, but make their limitations clear if they are only partial views.

## Boundaries

- Do not add tool prose to the prompt just to make text output look complete.
- Do not turn this into the full CTX-009 trace/debug model unless the implementation naturally collapses the two.
- Do not persist inspection turns or mutate freshness state while inspecting context.

## UX Implications

Plain output remains readable. JSON includes the full context sent to the model. Existing sessions can be inspected by canonical id without changing their transcript. Automatic producers remain opt-in through `context producers run`.

## Done

- `shrimpy context` output matches a real turn for the requested agent and session.
- JSON output includes the final context sent to the model.
- Tests prove parity between `shrimpy context` output and captured live session/model-call context.
- Docs describe prompt sections, turn context, active tools, and final message payloads as parts of one context inspection contract.
