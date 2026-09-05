# 🦐 Overview

Shrimpy gives agents a home on disk. It is a small, file-backed home-agent system built on Pi: the workspace is the durable home, agents are persistent actors inside it, and you inspect everything through ordinary files and CLI commands.

Pi owns model calls, tool execution, the interactive TUI, session runtime, and transcript persistence. Shrimpy owns the surrounding home: workspace conventions, context assembly, channels, surfaces, watches, and the `shrimpy <command>` surface. Shrimpy depends on registry-published `@earendil-works/*` Pi packages.

## Primitives

- **Workspace** — the persistent home directory, `~/.shrimpy/` by default. Holds config, context, agents, channels, and state. See [workspace.md](workspace.md).
- **Agent** — a persistent actor with identity, memory, skills, saved work, sessions, and watches. Setup starts with two: `shrimpy` for normal work and `mechanic` for setup and repair.
- **Channel** — a shared room and log, append-only JSONL under `channels/`. See [channels.md](channels.md).
- **Session** — a private Pi working context for turns, tool use, and transcript. See [sessions.md](sessions.md).
- **Watch** — an agent-owned scheduled prompt or command check that routes attention through channels. See [runtime.md](runtime.md).
- **Skill** — a Markdown instruction set advertised to agents. See [skills.md](skills.md).

Useful behavior should come from composing these pieces before it becomes another core feature.

## How Work Runs

There are two execution paths.

Direct local commands — `shrimpy`, `shrimpy chat [agent]`, `shrimpy run "prompt"` — open a session for one agent. Ordinary assistant text is the response path.

Channel work goes through `shrimpy-gateway`, the long-running process:

1. A human, surface, watch, CLI command, or agent writes a message to a channel log.
2. The gateway offers new messages to channel members; each agent's channel policy decides whether a message becomes a turn.
3. The handling agent runs a private Pi session for that channel, using tools as needed.
4. Public replies use publication helpers such as `reply`; the gateway outbox delivers them through a bound surface such as Telegram when one exists.

Watches use the same channel path: the gateway advances them and posts their messages into channels, where normal membership and policy decide which agent wakes.

## Where to Look Next

- [setup.md](setup.md) — install and first-run setup.
- [design.md](design.md) — design principles and constraints.
- [architecture.md](architecture.md) — implementation components and layering.
- [cli.md](cli.md) — the command surface.
- [configuration.md](configuration.md) — config files and fields.
- [../backlog/index.md](../backlog/index.md) — active work.
