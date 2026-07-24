# 🦐 Architecture

Shrimpy is composed from ordinary files, ordinary CLI commands, ordinary Pi sessions, and a small set of home-agent primitives.

## Primitives

- **Workspace** — the persistent home for config, model-visible context, channels, watches, framework docs, agents, auth, models, logs, media, and state.
- **Agent** — a persistent actor with identity docs, memory, tools, skills, and Pi sessions.
- **AppRuntime** — the application kernel that resolves paths, config, surface egresses, tool config, context config, and session bootstrap inputs.
- **ChannelBus** — the facade runtime callers use for channel IO. It delegates storage and typed message construction to focused channel components. See [channels.md](channels.md).
- **ChannelStore** — append-only JSONL persistence, reads, watches, backlog draining, and byte-offset cursors.
- **Typed Channel Protocol** — channel message `content` is one of `text`, `image`, `image_group`, `unsupported_media`, or `system`.
- **Channel outbox** — gateway worker that tails channel logs, sends outbound-eligible messages through surface egress, and records delivery receipts.
- **Channel membership** — the source of truth for which agents participate in a channel.
- **Agent channel policy** — per-agent policy for which visible channel messages become turns.
- **Session** — one private Pi working context identified by agent, namespace, name, and profile, with independent purpose, delivery, and storage policy. See [sessions.md](sessions.md).
- **SessionResolver** — the single policy path used by foreground, gateway, setup, run, and worker hosts.
- **SessionPool** — one gateway lane per channel session, with the only FIFO queue for that lane and out-of-band stop.
- **Surface** — a transport-facing interaction layer such as Telegram. Each surface is a self-contained vertical at `src/surfaces/<name>/` and registers via the `ChatSurfaceModule` interface; `AppRuntime` aggregates the registry without knowing surface kinds.
- **Gateway** — the long-running process that runs surfaces, dispatches channel messages, and advances agent-owned watches.
- **Watch** — an agent-owned background attention rule. Its `trigger` says what the system is keeping an eye on; time is one trigger kind. A message watch is the simple wake path: when the trigger fires, the gateway posts its text into a named channel for that agent.
- **Watch Clock** — the small clock used by watches with time triggers. It does not choose which agent wakes; normal channel membership and agent policy handle delivery.
- **Skill** — prompt and resource material loaded into a session. See [skills.md](skills.md).
- **Prompt context** — model-visible material selected by `context.sources`: stable Markdown from workspace and agent sources, plus turn-scoped runtime and command facts. See [context-assembly.md](context-assembly.md).

## Boundaries

- Every feature is reachable through a `shrimpy <command>` path.
- Channels are append-only logs.
- Sessions carry instructions and private working context. Channels carry routing and logs.
- Channel membership, not agent config, determines channel participation. Agent config owns wake policy.
- Agent resources (`SOUL.md`, `context/`, skills, sessions, watches) are part of the agent contract.
- Workspace and agent context are normal Markdown selected through context sources.
- Skills are Markdown instruction sets advertised to agents as context trails.
- Shrimpy owns the model-facing system prompt; Pi's built prompt is replaced before model calls. See [context-assembly.md](context-assembly.md).
- Live state in prompts points at tools or CLI commands instead of dumping raw logs.
- Shrimpy wraps Pi; extension happens at specific pressure points.
- One-user project: no legacy compatibility paths unless explicitly requested.

## Layering

```text
CLI / gateway / surfaces
  -> AppRuntime
  -> ChannelBus facade / config / context / sessions / tools
  -> ChannelStore / ChannelPublisher / ChannelManifest / ChannelOutbox
  -> Pi session runtime
  -> model provider + transcript storage
```

Where each concept lives:

- Cross-cutting config parsing: `src/config/`. Each surface's config schema and resolver: `src/surfaces/<name>/config.ts`.
- Workspace paths: `src/app/paths.ts`.
- Channel persistence, typed message construction, manifests, outbox receipts, and membership: `src/channels/`. Protocol and policy semantics are in [channels.md](channels.md).
- Each surface vertical: third-party client, real-time listener, channel translation, outbound formatting, command dispatch, config schema, lifecycle. Shared chat primitives and the surface module contract: `src/surfaces/shared/`.
- Session context, turn context, metadata, and Pi bootstrap: `src/sessions/` and `src/context/`.
- Agent lifecycle: `src/agents/`.

## Direction

The current architecture supports durable agents, channels, agent-owned watches, skills, and child runs. The design pressure behind these choices is captured in [design.md](design.md). Active refinement work is tracked in [../backlog/index.md](../backlog/index.md). Context assembly details live in [context-assembly.md](context-assembly.md).
