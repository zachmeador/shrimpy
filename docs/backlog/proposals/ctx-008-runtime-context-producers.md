---
status: draft
priority: P2
area: Context
depends_on: []
---

# CTX-008: Runtime Context Producers As CLI Commands

## Why

Runtime turn-context producers are visible beside file, directory, and command sources, but they are still internal framework emitters. Giving each producer a deterministic CLI render path would make debugging cleaner and may let the runtime source type collapse into ordinary command-like context sources later.

This is lowest-priority observability work. Build it only when runtime context provenance becomes a recurring debugging problem, or when continuation, watch, and worker-status facts expand enough that `runtime:turn-context` is no longer inspectable enough.

## Current State

- `shrimpy context sources list` exposes `runtime:turn-context` as a runtime source, and `shrimpy context sources run runtime:turn-context` renders the whole current turn context.
- `shrimpy context turn` also renders the combined turn context.
- Individual runtime producers such as channel unread, session status, source message facts, and watch provenance are not separately addressable from CLI.

## Build

- Define explicit inputs for rendering built-in runtime context producers.
- Add CLI coverage for rendering individual runtime producers with agent, channel, and turn/session inputs where relevant.
- Feed producer output through `buildTurnContext` / `renderTurnContext` so the CLI view matches the ephemeral context injected by Shrimpy's Pi context hook.
- Include producers for continuation-adjacent runtime facts as they land, especially current source-message metadata, watch/run provenance, and worker status pointers.
- Decide whether `runtime` remains a source type or becomes a set of built-in command-backed sources.
- Keep prompt assembly on the existing unified context-source path, and keep turn-scoped producers out of durable user prompt text.

## Boundaries

- Do not create a second prompt assembly path.
- Do not introduce separate prompt inspection/rendering paths. Debug output should match the direct session hook path and the gateway explicit turn-value path.
- Keep output compact, deterministic, and inspectable.
- Do not add migration or compatibility code unless a concrete workspace-facing break requires it.

## Done

- Built-in turn-context producers can be rendered individually from the CLI.
- `shrimpy context sources list/run` still exposes the effective context surface.
- Continuation-adjacent and worker-status context producers can be inspected without replaying raw channel logs or session transcripts.
- Tests cover source listing, source rendering, and prompt assembly parity.
