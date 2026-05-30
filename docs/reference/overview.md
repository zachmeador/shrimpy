# 🦐 Overview

Shrimpy is a multi-agent home AI system built on Pi. Current upstream Pi packages publish under `@earendil-works/*`; older Shrimpy pins may still reference the previous `@mariozechner/*` package scope until the dependency migration lands. The workspace is the home system; agents are persistent actors inside it. Shrimpy wraps Pi with home-agent primitives: workspace context, durable agents, channels, surfaces, scheduler wakes, and a CLI.

## Current Shape

- The main binary is `shrimpy`, backed by `src/cli.ts`.
- The long-running process is `shrimpy-gateway`, backed by `src/gateway.ts`.
- The workspace path comes from `~/.shrimpy-workspace.json`; when unset, it defaults to `.shrimpy/` under the project root.
- Runtime config lives in `workspace/config/shrimpy.json`.
- Channels are append-only JSONL logs under `workspace/channels/`.
- Agents live under `workspace/agents/<id>/` with their own prompt resources, memory, skills, and sessions.
- Pi owns model calls, tool execution, TUI behavior, and transcript persistence. Shrimpy owns session framing and routing.
- Prompts are assembled from typed `PromptSection`s — identity/memory/instruction first, capability next, runtime/activity/evidence last — with a per-turn briefing envelope on top.

## Core Loop

1. A human, surface, scheduler, CLI command, or agent writes a typed message to a channel.
2. The gateway watches channel logs and decides which agent sessions wake.
3. Each target agent runs a private Pi session for that channel.
4. The agent uses tools as needed.
5. Messages addressed to the user go through `send_message`, which logs to the channel and delivers through a surface when one is configured.

`shrimpy` and `shrimpy run` open direct local Pi sessions without first writing the prompt into a channel log.

## Where to Look Next

- [design.md](design.md) — philosophy, settled decisions, and active reconsiderations.
- [architecture.md](architecture.md) — primitives and layering.
- [runtime.md](runtime.md) — execution flow.
- [context-assembly.md](context-assembly.md) — prompt section assembly and the per-turn briefing envelope.
- [cli.md](cli.md) — commands.
- [../backlog/index.md](../backlog/index.md) — active work.
