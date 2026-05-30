# 🦐 ADMIN-001: Bundled Admin Agent

Status: todo
Priority: P2
Area: Admin Agent

## Why
Workspace setup, repair, configuration changes, and larger Shrimpy modifications need a normal agent with richer default context. A bundled `admin` agent should use existing Shrimpy primitives instead of a separate control plane.

## Build
- Ship a bundled ordinary `admin` agent.
- `shrimpy setup init` should create both `shrimpy` and `admin`.
- Give admin richer default context/resources for setup and repair work.
- Polished setup should launch an interactive admin session that uses setup skills/resources internally.

## Boundaries
- Do not make admin a privileged runtime species.
- Do not hardwire agent decision-making that belongs in prompts, skills, or normal logs.

## Notes
- Likely files: `src/setup.ts`, setup templates, `src/agents/workspace-manager.ts`, and skills/resources under setup templates.
- Preserve CLI-first workflows for any configuration changes admin performs.

## Done
- New workspaces get `shrimpy` and `admin`.
- Admin has distinct prompt resources and useful setup/repair skills.
- Tests cover setup output and agent config shape.
