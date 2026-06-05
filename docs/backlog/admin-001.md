# 🦐 ADMIN-001: Bundled Mechanic Agent

Status: review
Priority: P2
Area: Mechanic Agent

## Why
Workspace setup, repair, configuration changes, and larger Shrimpy modifications need a normal agent with richer default context. Every initialized Shrimpy environment should include a bundled `mechanic` agent alongside the default `shrimpy` agent, using existing Shrimpy primitives instead of a separate control plane.

## Current State
- Fresh setup still seeds only the default `shrimpy` agent, with `home` and `maintenance` channel membership for that agent.
- Generic agent primitives now exist: `shrimpy agent add|set|tui|run`, channel membership/policy commands, and mechanic-owned setup skills. Mechanic should be seeded through those ordinary primitives.
- `shrimpy setup` currently launches a setup skill as `shrimpy`, not `mechanic`.
- The mechanic skill pack now lives in setup templates under `src/setup/templates/mechanic/skills/`, including `shrimpy-mechanic-ideas` and its pattern-inventory reference for owner choices.
- There is no top-level `shrimpy mechanic` command or `modelPolicy` config yet.

## Build
- Ship a bundled ordinary `mechanic` agent.
- Treat `shrimpy` and `mechanic` as the two default agents in every new environment.
- `shrimpy setup init` should create both `shrimpy` and `mechanic`.
- Give mechanic richer default context/resources for setup and repair work.
- Configure mechanic to use the required `coding` model policy and deliberate reasoning when available. The normal setup path may point both mechanic and the main `shrimpy` agent at `coding`; a separate local/private policy remains an advanced preference.
- Seed a default mechanic skill pack for setup, repair, configuration changes, and app/agent guidance, starting from the existing `shrimpy-mechanic-ideas` draft. `admin` can remain a historical/backlog label or alias if useful, but `mechanic` is the preferred user-facing name.
- Polished setup should launch an interactive mechanic session that uses setup skills/resources internally.
- The top-level maintenance chat entry point is `shrimpy mechanic`; do not add a competing `shrimpy doctor` front door.

## Boundaries
- Do not make mechanic a privileged runtime species.
- Do not hardwire agent decision-making that belongs in prompts, skills, or normal logs.

## Notes
- Likely files: `src/setup/init.ts`, setup templates, `src/agents/workspace-manager.ts`, and skills/resources under setup templates.
- Preserve CLI-first workflows for any configuration changes mechanic performs.
- Early mechanic skill pack ideas live under `src/setup/templates/mechanic/skills/`: guided surface setup, workspace repair, skill installation/shaping, app-agent creation guidance, usage assessments for implementation opportunities, and reusable explainers for how Shrimpy's primitives fit together.
- Related follow-up: [MECH-001](mech-001-skill-opportunity-watch.md) covers an opt-in mechanic-owned watch that reviews real Shrimpy usage, writes a Markdown assessment, and messages the user with concrete skill/app ideas only when useful.

## Done
- New workspaces get `shrimpy` and `mechanic`.
- Mechanic has distinct prompt resources and useful setup/repair skills.
- Mechanic has an inspectable `modelPolicy` path suitable for setup, repair, and larger coding tasks.
- The project has a clear follow-up path for `shrimpy mechanic` as the direct TUI command.
- Tests cover setup output and agent config shape.
