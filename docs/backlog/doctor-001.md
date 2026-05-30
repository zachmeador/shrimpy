# 🦐 DOCTOR-001: Admin Repair/Doctor Session

Status: todo
Priority: P2
Area: Doctor

## Why
Workspace drift and broken config should be repairable through a normal Shrimpy session. `shrimpy doctor` should launch the bundled `admin` agent in a focused repair mode that inspects state and helps repair issues while staying inside the existing agent/session model.

## Build
- Add `shrimpy doctor` as a normal repair-oriented TUI session backed by the bundled `admin` agent.
- Inspect workspace drift, config, channels, sessions, and surface state.
- Provide repair guidance and commands through existing Shrimpy surfaces and admin repair resources.

## Boundaries
- Do not create a separate doctor runtime.
- Do not silently mutate workspace files without explicit user action.

## Notes
- Depends on [ADMIN-001](admin-001.md): `shrimpy doctor` launches the bundled admin agent with repair-focused resources.
- Likely files: `src/cli.ts`, `src/commands/*`, `src/sessions/direct.ts`, and admin repair prompt/resources.
- This should remain a clear CLI entry point rather than a separate troubleshooting product.

## Done
- `shrimpy doctor` starts a focused admin repair session.
- The session has useful diagnostic context.
- Tests cover command wiring and prompt/resource selection.
