# 🦐 CODE-001: External Coding-Agent Availability Inspection

Status: todo
Priority: P2
Area: Coding Agents

## Why
Shrimpy should know whether external coding-agent CLIs such as Claude Code and Codex are available before adding delegation automation. Setup and diagnostics need a simple persisted availability/auth view.

## Build
- Detect external coding-agent CLIs during setup/init.
- Persist availability and auth status in workspace state.
- Expose inspection through a CLI command.

## Boundaries
- Do not add delegation automation in this slice.
- Do not assume one external CLI is required for Shrimpy to run.

## Notes
- Likely files: `src/setup.ts`, `src/setup/service.ts`, `src/commands/*`, and workspace state helpers.
- Keep detection local and explicit; avoid network checks unless needed for auth status.

## Done
- Setup records detected coding-agent availability.
- CLI can inspect the recorded state.
- Tests cover missing and present CLI cases.
