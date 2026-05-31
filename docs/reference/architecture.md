# 🦐 Architecture

Shrimpy is composed from ordinary files, ordinary CLI commands, ordinary Pi sessions, and a small set of home-agent primitives.

## Primitives

- **Workspace** — the persistent home for config, channels, schedules, framework docs, agents, auth, models, logs, media, and state.
- **Agent** — a persistent actor with identity docs, memory, tools, skills, and Pi sessions.
- **AppRuntime** — the application kernel that resolves paths, config, surface routes, tool config, context config, and session bootstrap inputs.
- **ChannelBus** — the facade runtime callers use for channel IO. It delegates storage, typed message construction, and outbound delivery to focused channel components.
- **ChannelStore** — append-only JSONL persistence, reads, watches, backlog draining, and byte-offset cursors.
- **Typed Channel Protocol** — channel message `content` is one of `text`, `image`, `image_group`, `unsupported_media`, or `system`.
- **Channel egress** — surface-backed delivery for text already logged to a channel.
- **Channel membership** — the source of truth for which agents participate in a channel.
- **Agent attention** — per-agent policy for which subscribed channel messages become turns.
- **Session** — one private Pi working context for one agent, attached to either a channel or a local session label (`tui`, `run`).
- **SessionRegistry** — one active turn at a time per session, with FIFO queuing.
- **Surface** — a transport-facing interaction layer such as Telegram. Each surface is a self-contained vertical at `src/surfaces/<name>/` and registers via the `ChatSurfaceModule` interface; `AppRuntime` aggregates the registry without knowing surface kinds.
- **Gateway** — the long-running process that runs surfaces, dispatches channel messages, and advances scheduled work.
- **Scheduler** — file-driven recurring work. Schedules emit channel messages that become normal agent turns. Agent schedules live in `agents/<id>/schedules.json`; optional workspace scheduler definitions live in `config/schedules.json`.
- **Skill** — prompt and resource material loaded into a session.
- **Memory** — agent-owned Markdown under `agents/<id>/context/`. Top-level files are session context; `context/people/<actor-id>.md` and `context/channels/<name>.md` are loaded only for matching turns. Identity links and the workspace owner live in `state/users.json`. See [memory.md](memory.md).
- **Prompt assembly** — orders typed `PromptSection`s by `kind` (identity/memory/instruction first, capability next, runtime/activity/evidence last) into one system prompt, and prepends the per-turn context envelope with runtime facts, unread-channel pointers, command-source output, and path-indexed memory slices.

## Boundaries

- Every feature is reachable through a `shrimpy <command>` path.
- Channels are append-only logs.
- Sessions carry instructions and private working context. Channels carry routing and logs.
- Channel membership, not agent config, determines channel participation.
- Agent resources (`SOUL.md`, `context/`, skills, sessions, schedules) are part of the agent contract.
- Agent memory is normal Markdown; there is no separate memory control plane.
- Shared framework/tool guidance lives in workspace `profile/SYSTEM.md` instead of being copied per agent.
- Skills are Pi-style capability bundles under workspace or agent skill directories.
- Prompt sections are ordered by kind: stable identity/memory/instruction first, capability next, runtime/activity/evidence last.
- Live state in prompts points at tools or CLI commands instead of dumping raw logs.
- Shrimpy wraps Pi; extension happens at specific pressure points.
- One-user project: no legacy compatibility paths unless explicitly requested.

## Layering

```text
CLI / gateway / surfaces
  -> AppRuntime
  -> ChannelBus facade / config / context / sessions / tools
  -> ChannelStore / ChannelPublisher / ChannelEgress
  -> Pi session runtime
  -> model provider + transcript storage
```

Where each concept lives:

- Cross-cutting config parsing: `src/config/`. Each surface's config schema and resolver: `src/surfaces/<name>/config.ts`.
- Workspace paths: `src/app/paths.ts`.
- Channel persistence, typed message construction, egress (including the prefix→send registry), and membership: `src/channels/`.
- Each surface vertical: third-party client, real-time listener, channel translation, outbound formatting, command dispatch, config schema, lifecycle. Shared chat primitives and the surface module contract: `src/surfaces/shared/`.
- Session context, turn context, metadata, and Pi bootstrap: `src/sessions/` and `src/context/`.
- Path-indexed memory turn slices: `src/memory/context.ts`.
- Agent lifecycle: `src/agents/`.

## Direction

The current architecture supports durable agents, channels, scheduler wakes, skills, and child runs. The design pressure behind these choices is captured in [design.md](design.md). Active refinement work is tracked in [../backlog/index.md](../backlog/index.md). Context assembly details live in [context-assembly.md](context-assembly.md).
