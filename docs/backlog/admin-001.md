# 🦐 ADMIN-001: Bundled Mechanic Agent

Status: todo
Priority: P2
Area: Mechanic Agent

## Why
Workspace setup, repair, configuration changes, and larger Shrimpy modifications need a normal agent with richer default context. A bundled `mechanic` agent should use existing Shrimpy primitives instead of a separate control plane.

## Build
- Ship a bundled ordinary `mechanic` agent.
- `shrimpy setup init` should create both `shrimpy` and `mechanic`.
- Give mechanic richer default context/resources for setup and repair work.
- Configure mechanic to prefer a powerful hosted model endpoint and deliberate reasoning when available. The main `shrimpy` agent can still be encouraged toward local/private models for everyday chat.
- Seed a default mechanic skill pack for setup, repair, configuration changes, and app/agent guidance. `admin` can remain a historical/backlog label or alias if useful, but `mechanic` is the preferred user-facing name.
- Polished setup should launch an interactive mechanic session that uses setup skills/resources internally.

## Boundaries
- Do not make mechanic a privileged runtime species.
- Do not hardwire agent decision-making that belongs in prompts, skills, or normal logs.

## Notes
- Likely files: `src/setup.ts`, setup templates, `src/agents/workspace-manager.ts`, and skills/resources under setup templates.
- Preserve CLI-first workflows for any configuration changes mechanic performs.
- `doctor` should stay a clear repair entry point where useful, but the broader product direction is a mechanic specialist rather than a separate doctor identity.
- Early mechanic skill pack ideas: guided surface setup, workspace repair, skill installation/shaping, app-agent creation guidance, and reusable explainers for how Shrimpy's primitives fit together.

## Done
- New workspaces get `shrimpy` and `mechanic`.
- Mechanic has distinct prompt resources and useful setup/repair skills.
- Mechanic has an inspectable default model path suitable for setup, repair, and larger coding tasks.
- Tests cover setup output and agent config shape.
