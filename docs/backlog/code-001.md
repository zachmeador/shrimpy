# 🦐 CODE-001: Worker Backend Availability Inspection

Status: review
Priority: P2
Area: Coding Agents

## Why
Shrimpy should know whether worker backends such as Codex and Claude Code are available before adding delegation automation. Setup and diagnostics need a simple persisted availability/auth view.

## Build
- Detect external worker CLIs during setup/init.
- Persist availability and auth status in workspace state.
- Expose inspection through a CLI command.

## Boundaries
- Do not add delegation automation in this slice.
- Do not assume one external CLI is required for Shrimpy to run.

## Notes
- Likely files: `src/setup/init.ts`, `src/setup/onboarding.ts`, `src/setup/state.ts`, `src/commands/*`, and workspace state helpers.
- Keep detection local and explicit; avoid network checks unless needed for auth status.

## Done
- Setup records detected worker backend availability.
- `shrimpy worker backends` can inspect the recorded state.
- Tests cover missing and present CLI cases.
