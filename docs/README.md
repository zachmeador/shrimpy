# 🦐 Shrimpy Docs

These docs are the project map for Shrimpy. Current behavior and settled design direction live in `reference/`. Active work, background thinking, and source research live in separate directories so they do not blur into the reference surface.

## Reference

- [reference/README.md](reference/README.md) — stable docs index.
- [reference/overview.md](reference/overview.md) — short orientation and current project shape.
- [reference/design.md](reference/design.md) — philosophy, settled decisions, and active architecture reconsiderations.
- [reference/architecture.md](reference/architecture.md) — core primitives, boundaries, and design rules.
- [reference/runtime.md](reference/runtime.md) — how CLI sessions, gateway dispatch, scheduler runs, and child runs execute.
- [reference/context-assembly.md](reference/context-assembly.md) — prompt section assembly and the per-turn context envelope.
- [reference/memory.md](reference/memory.md) — memory model, upkeep, and continuity aspiration.
- [reference/skills.md](reference/skills.md) — workspace and agent skill bundles, Pi loading, and CLI management.
- [reference/turn-context.md](reference/turn-context.md) — compact per-turn alerts and inspect pointers.
- [reference/compaction.md](reference/compaction.md) — session compaction policy, runtime flow, provider path, and failures.
- [reference/cli.md](reference/cli.md) — command surface and agent-friendly workflows.
- [reference/configuration.md](reference/configuration.md) — workspace config files and the knobs that matter.
- [reference/workspace.md](reference/workspace.md) — workspace layout, prompt resources, sessions, state, and logs.
- [reference/surfaces.md](reference/surfaces.md) — channels, adapters, Telegram, and visible identity.
- [reference/development.md](reference/development.md) — repo workflow, tests, docs rules, and implementation guidance.

## Project State

- [backlog/index.md](backlog/index.md) — active engineering work.

## Background

- [musings/](musings/README.md) — design taste, product direction, and unfinished thinking.
- [research/](research/README.md) — source notes and external comparison research.

`reference/` is authoritative for current behavior. Musings and research are useful context, but settled decisions should be promoted into reference docs.
