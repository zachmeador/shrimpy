# 🦐 Overview

Shrimpy is a multi-agent home AI system built on Pi. Shrimpy depends directly on registry-published `@earendil-works/*` Pi packages; it does not carry a local Pi fork or vendored Pi artifact. The workspace is the home system; agents are persistent actors inside it. Shrimpy wraps Pi with home-agent primitives: workspace context, durable agents, channels, surfaces, agent-owned watches, and a CLI.

## Current Shape

- The main binary is `shrimpy`, backed by `src/cli.ts`.
- The long-running process is `shrimpy-gateway`, backed by `src/gateway.ts`.
- The workspace path comes from `~/.shrimpy-workspace.json`; when unset, it defaults to `.shrimpy/` under the project root.
- Runtime config lives in `workspace/config/shrimpy.json`.
- Channels are append-only JSONL logs under `workspace/channels/`; see [channels.md](channels.md).
- Agents live under `workspace/agents/<id>/` with their own prompt resources, memory, skills, and sessions.
- Pi owns model calls, tool execution, the interactive TUI, the session runtime, and transcript persistence. Shrimpy owns session framing, routing, workspace conventions, and targeted TUI seams such as the unified `/settings` selector.
- Prompts are assembled from typed `PromptSection`s — identity/memory/instruction first, capability next, runtime/activity/evidence last — into a stable system prompt. Per-turn context is injected separately through Pi's context hook.

## Core Loop

1. A human, surface, watch, CLI command, or agent writes a typed message to a channel.
2. The gateway watches channel logs and offers messages to channel members.
3. Each visible agent's channel policy decides whether the message becomes a
   turn.
4. Each handling agent runs a private Pi session for that channel.
5. The agent uses tools as needed.
6. User-visible agent responses go through active-channel publication helpers such as `reply` or `ask`, which log to the channel and deliver through a surface when one is configured. `send_message` remains available for explicit channel routing.

`shrimpy` and `shrimpy run` open direct local sessions without first writing the prompt into a channel log. In those sessions, normal assistant text is the response path; channel publication helpers are for gateway/channel turns. The interactive TUI uses Pi's `InteractiveMode` so slash autocomplete and default UI behavior stay aligned with Pi, while Shrimpy patches `/settings` to expose both Shrimpy and Pi-owned settings.

## Where to Look Next

- [design.md](design.md) — current design principles and constraints.
- [architecture.md](architecture.md) — primitives and layering.
- [runtime.md](runtime.md) — execution flow.
- [channels.md](channels.md) — channel protocol, membership, addressing, wake policy, and egress.
- [sessions.md](sessions.md) — session files, lifecycle, model metadata, and inspection.
- [context-assembly.md](context-assembly.md) — prompt section assembly and provider-bound turn-context injection.
- [memory.md](memory.md) — memory model and upkeep.
- [skills.md](skills.md) — skill bundle shape and Pi-backed loading.
- [cli.md](cli.md) — commands.
- [../backlog/index.md](../backlog/index.md) — active work.
