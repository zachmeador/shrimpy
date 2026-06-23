# 🦐 Overview

Shrimpy gives agents a home on disk. It is a small, file-backed home-agent system built on Pi: the workspace is the durable home, agents are persistent actors inside it, and you inspect it through ordinary files and CLI commands.

Shrimpy stays small by leaning on a few primitives. Agents own identity, memory, skills, saved work, sessions, and watches. Channels are shared rooms and logs. Sessions are private working contexts for turns, tool use, and transcript. Watches run scheduled prompts or command checks and route anything worth attention through channels. Skills are Markdown instruction sets. Useful behavior should come from composing those pieces before it becomes another core feature.

Shrimpy depends directly on registry-published `@earendil-works/*` Pi packages; it does not carry a local Pi fork or vendored Pi artifact. Pi owns model calls, tool execution, the interactive TUI, session runtime, transcript format, and transcript persistence. Shrimpy owns the surrounding home: workspace conventions, session planning, context assembly, routing, channel publication, surfaces, watches, and the `shrimpy <command>` surface.

## Current Shape

- The main binary is `shrimpy`, backed by `src/cli.ts`.
- The long-running process is `shrimpy-gateway`, backed by `src/gateway.ts`.
- The workspace path comes from `~/.shrimpy/.shrimpy-workspace.json`, with `~/.shrimpy-workspace.json` as a fallback; when unset, it defaults to `~/.shrimpy/`.
- Runtime config lives in `workspace/config/shrimpy.json`.
- Setup starts with two agents: `shrimpy` for normal work and `mechanic` for setup, repair, models, agents, skills, channels, watches, and upgrades.
- Agents live under `workspace/agents/<id>/` with their own `SOUL.md`, `context/`, `vault/`, `projects/`, `skills/`, `watches.json`, and `sessions/`.
- Workspace-level prompt context lives under `workspace/context/` and is selected with `workspace:context/` or a more specific configured source.
- Channels are append-only JSONL logs under `workspace/channels/`. Channel membership controls visibility; each visible agent's `channelPolicy` decides whether a message becomes a turn. See [channels.md](channels.md).
- Sessions persist under each agent as Pi `.jsonl` transcripts. A session is attached to either a local label such as `tui` or `run`, or to a channel handled by the gateway. See [sessions.md](sessions.md).
- Agent memory is Markdown under `agents/<id>/context/` and loads for that agent by default. Saved reports and collections belong in `vault/`; code and app work belong in `projects/`. See [memory.md](memory.md) and [workspace.md](workspace.md).
- Skills are visible Markdown packages under workspace or agent `skills/` roots. Shrimpy selects the skill paths; Pi loads and invokes them. See [skills.md](skills.md).
- Prompts are assembled from typed `PromptSection`s into one stable system prompt. Per-turn facts are prefixed to the current user message with a short instruction so the session transcript matches what the model saw. See [context-assembly.md](context-assembly.md) and [turn-context.md](turn-context.md).

## How Work Runs

Shrimpy has two main execution paths.

Direct local commands such as `shrimpy`, `shrimpy chat [agent]`, and `shrimpy run` open a session for one agent without first writing the prompt to a channel log. Ordinary assistant text is the response path. The interactive TUI uses Pi's `InteractiveMode` so slash autocomplete and default UI behavior stay aligned with Pi, while Shrimpy patches `/settings` to expose both Shrimpy and Pi-owned settings.

Channel work goes through the gateway:

1. A human, surface, watch, CLI command, or agent writes a typed message to a channel log.
2. The gateway watches channel logs and offers new messages to channel members.
3. Each visible agent's channel policy decides whether the message becomes a turn.
4. Each handling agent runs a private Pi session for that channel.
5. The agent uses tools as needed.
6. Public replies use active-channel helpers such as `reply`, `ask`, `notify`, or `report`, which append agent messages to the channel. The gateway outbox delivers those channel messages through a bound surface when one exists. `send_message` remains available for explicit channel routing.

Watches use the same channel path as everything else. Agent-owned watches live in `agents/<id>/watches.json`; the gateway advances them, records run state, and either posts watch-authored messages to channels or runs command checks that can emit to channels. Normal membership and agent policy decide which agent wakes.

## Where to Look Next

- [design.md](design.md) — current design principles and constraints.
- [architecture.md](architecture.md) — primitives and layering.
- [runtime.md](runtime.md) — execution flow.
- [channels.md](channels.md) — channel protocol, membership, addressing, wake policy, and egress.
- [sessions.md](sessions.md) — session files, lifecycle, model metadata, and inspection.
- [context-assembly.md](context-assembly.md) — prompt section assembly and persisted turn-context injection.
- [memory.md](memory.md) — memory model and upkeep.
- [skills.md](skills.md) — skill directory shape and Pi-backed loading.
- [cli.md](cli.md) — commands.
- [../backlog/index.md](../backlog/index.md) — active work.
