# 🦐 Shrimpy Docs

These docs are the project map for Shrimpy. Current behavior lives in `reference/`. Active work, background thinking, and source research live in separate directories so they do not blur into the reference surface.

## Reference

- [reference/README.md](reference/README.md) — stable docs index.
- [reference/overview.md](reference/overview.md) — short orientation and current project shape.
- [reference/design.md](reference/design.md) — current design principles and constraints.
- [reference/architecture.md](reference/architecture.md) — core primitives, boundaries, and design rules.
- [reference/runtime.md](reference/runtime.md) — how direct runs, gateway dispatch, scheduler runs, and child runs execute.
- [reference/channels.md](reference/channels.md) — channel protocol, membership, addressing, wake policy, inspection, and egress.
- [reference/sessions.md](reference/sessions.md) — session kinds, files, lifecycle, model metadata, and inspection.
- [reference/tools.md](reference/tools.md) — Pi built-ins, Shrimpy daemon tools, and agent tool policy.
- [reference/security.md](reference/security.md) — tool policy and inspection commands.
- [reference/context-assembly.md](reference/context-assembly.md) — prompt section assembly and the per-turn context envelope.
- [reference/memory.md](reference/memory.md) — memory model, upkeep, and context loading.
- [reference/skills.md](reference/skills.md) — workspace and agent skill bundles, Pi loading, and CLI management.
- [reference/turn-context.md](reference/turn-context.md) — compact per-turn alerts and inspect pointers.
- [reference/compaction.md](reference/compaction.md) — session compaction policy, runtime flow, provider path, and failures.
- [reference/cli.md](reference/cli.md) — command surface and agent-friendly workflows.
- [reference/configuration.md](reference/configuration.md) — workspace config files and the knobs that matter.
- [reference/workspace.md](reference/workspace.md) — workspace layout, prompt resources, sessions, state, and logs.
- [reference/surfaces.md](reference/surfaces.md) — adapters, Telegram, visible identity, and surface thread state.
- [reference/development.md](reference/development.md) — repo workflow, tests, docs rules, and implementation guidance.

## Project State

- [backlog/index.md](backlog/index.md) — active engineering work.

## Background

- [musings/](musings/README.md) — design taste, product direction, and unfinished thinking.
- [research/](research/README.md) — source notes and external comparison research.

`reference/` is authoritative for current behavior. Musings and research are useful context, but they do not become reference docs until the behavior ships.
