# 🦐 Architecture

Shrimpy embeds Pi in local commands, gateway sessions, and workers. This page maps the implementation components; [overview.md](overview.md) introduces the user concepts and [design.md](design.md) owns the design principles.

## Components

| Component | Responsibility |
|---|---|
| `AppRuntime` | Resolve workspace paths, configuration, models, context, tools, surfaces, and session bootstrap inputs. |
| `SessionResolver` | Select session identity, purpose, delivery, storage, and effective policy for each host. |
| `ChannelBus` / `ChannelStore` | Construct typed channel messages and persist append-only JSONL with read and cursor support. |
| `ChannelDeliveryLoop` | Tail channel logs and dispatch eligible agent work. |
| `SessionPool` | Serialize each agent's channel-session lane and route stop controls out of band. |
| `ChannelOutbox` | Deliver eligible channel records through bound surfaces and record receipts. |
| Surface modules | Translate transport input, commands, and output through the shared surface contract. |
| Watch clock | Advance agent-owned schedules and emit messages or run command checks. |
| Pi session runtime | Run model calls and tools, maintain transcripts, and host the interactive TUI. |

## Layering

```text
CLI / gateway / surfaces
  -> AppRuntime
  -> config / context / sessions / tools / ChannelBus
  -> channel storage, membership, and outbox
  -> Pi session runtime
```

Foreground commands open sessions directly. The gateway composes surfaces, channel delivery, the watch clock, workspace checkpoints, and the web sidecar. See [runtime.md](runtime.md) for execution flow and [sessions.md](sessions.md) for identity and ownership.

## Code Map

- `src/app/`: shared runtime composition and Pi integration.
- `src/config/`: cross-cutting configuration; each surface validates its own section in `src/surfaces/<name>/config.ts`.
- `src/workspace/`: paths, search, and checkpoints.
- `src/channels/`: persistence, typed messages, manifests, membership, and outbox delivery. See [channels.md](channels.md).
- `src/sessions/` and `src/context/`: session lifecycle, Pi bootstrap, prompt assembly, and turn context.
- `src/agents/`: agent lifecycle and channel policy.
- `src/surfaces/`: transport verticals and shared contracts. See [surfaces.md](surfaces.md#surface-verticals).
- `src/watches/` and `src/gateway/`: scheduling and long-running host orchestration.
- `web/`: the separate workspace inspector. Core manages its configuration and process lifecycle; its readers consume workspace files directly.
