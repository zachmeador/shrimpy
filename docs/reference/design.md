# 🦐 Framework Design

This is Shrimpy's design doctrine, not an implementation spec.

## Core Claim

Shrimpy optimizes for agent-modifiable personal software.

The framework should make it cheap for agents to inspect, change, and extend a person's local software environment without turning the framework itself into the hardest thing to understand.

Its value comes from behavior per unit of architectural complexity: how much useful individualized behavior agents can create before the system becomes hard to work on.

Architecture simplicity is a product feature.

## Product Boundary

Shrimpy is a persistent home workspace with durable agents, channels, sessions, memory, watches, and skills.

It is CLI-first, file-backed, inspectable, and built on Pi until Pi is the constraint.

Shrimpy assumes high common sense from the user, not deep technical expertise. It should make local agent power visible and understandable without pretending that risky capabilities are safe for everyone.

## Design Laws

1. Few primitives, high composition.
2. Every real feature has a `shrimpy <command>` path.
3. Files, logs, commands, and sessions beat hidden framework state.
4. Channels route and record. Sessions think.
5. Skills are Markdown instruction sets advertised to agents as context trails.
6. Memory stays small and focused on what the user cares about and what the agent needs to do its job.
7. Background work needs a reason, owner, channel/message path, and artifact.
8. Capability claims must match real boundaries and assume user judgment.
9. Cheap models must be able to understand the system.
10. Bash and small CLIs beat tool sprawl by default.
11. Useful integrations can live as commands plus skills before becoming core support.
12. Legacy support is opt-in.

## Taste

Prefer:

- legible over clever
- inspectable over magical
- composable over comprehensive
- explicit over ambient
- budget-aware over always-on
- boring primitives over novel subsystems

Avoid:

- hidden routers
- silent prompt mutation
- default skill floods
- giant tool schemas
- fake security gates
- feature parity as strategy

## Gate For New Work

Add to core only when the change:

- makes Shrimpy easier for agents to understand or modify
- composes from existing primitives, or clearly justifies a new one
- is inspectable through normal files, logs, sessions, or commands
- preserves honest capability boundaries
- helps Shrimpy do fewer things better

Otherwise start in a fork, app, skill, backlog note, or musing.

## Related Docs

- [architecture.md](architecture.md) for current primitives and code boundaries
- [context-assembly.md](context-assembly.md) for prompt assembly
- [../backlog/index.md](../backlog/index.md) for active work
- [../musings/framework-design.md](../musings/framework-design.md) for longer source thinking
