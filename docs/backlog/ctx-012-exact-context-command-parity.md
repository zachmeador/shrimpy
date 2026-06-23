# 🦐 CTX-012: Exact Context Command Parity

Status: todo
Priority: P2
Area: Context
Depends On: context cleanup

## Why

`shrimpy context` is supposed to answer "what exact context will this agent/model turn see?" Today it still uses preview assembly paths and can miss material that real sessions pass through Pi/provider adapters. That is a correctness bug in the inspection command, not a separate designed context surface.

## Current State

- `shrimpy context` uses preview assembly paths, not the real session open/model-call path end to end.
- Stable prompt text, selected skills, turn context, user message preview, active tools, and provider request shape are not yet emitted from one authoritative context path.
- [CTX-009](later/ctx-009-context-trace-debug-view.md) describes a broader trace/debug model. This item is narrower: make the user-facing context command exact enough to trust before building a richer trace UI.

## Build

- Define the command contract: for a requested agent/session/turn, `shrimpy context` can render or JSON-dump the stable system prompt, selected skills, active tools/tool schemas, turn context, durable user message, and provider-facing message payload.
- Use the same session planning/open path as real sessions wherever possible. Avoid duplicating prompt, tool, or turn-context assembly just for preview output.
- Keep text output readable and compact. Put full structured payloads behind `--json` or an explicit inspect mode if needed.
- Preserve the existing section/source inspection commands, but make their limitations clear if they are only partial views.

## Boundaries

- Do not add tool prose to the prompt just to make text output look complete.
- Do not turn this into the full CTX-009 trace/debug model unless the implementation naturally collapses the two.
- Do not persist preview turns or mutate freshness state while inspecting context.

## Done

- `shrimpy context` output matches the context passed to Pi/provider adapters for the requested agent/session/turn.
- JSON output includes active tool schemas and the final provider-facing message payload.
- Tests prove parity between `shrimpy context` output and captured live session/model-call context.
- Docs describe prompt sections, turn context, active tools, and final message payloads as parts of one context inspection contract.
