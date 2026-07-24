---
status: draft
priority: P3
area: Coding Agents
depends_on: []
---

# CODE-003: Claude Code Worker Adapter

## Why

Codex and Pi cover the first worker slice. Claude Code can be added later behind the same worker adapter seam when its headless JSON and resume behavior is worth supporting.

## Build

- Implement the `claude` worker backend through the existing runner lifecycle.
- Detect and record compatible Claude Code CLI versions and auth status through the worker backend availability state.
- Start turns with headless JSON output, capture logs, infer structured status, and persist the backend session id.
- Resume the same Claude Code session for worker amendments.
- Use an explicit non-interactive permission posture so blocked permission gates report as blocked instead of hanging.

## Boundaries

- Do not add a separate `coding-agents` command.
- Do not expose Claude-specific controls outside the backend adapter.

## Done

- `shrimpy worker start --backend claude` runs a detached turn and records inspectable logs/status.
- `shrimpy worker send <id> ...` resumes the same Claude Code session.
- Tests cover unavailable CLI, successful start, failed start, status inference, and amendment resume.
