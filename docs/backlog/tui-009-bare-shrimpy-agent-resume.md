# 🦐 TUI-009: Bare Shrimpy Agent Resume

Status: draft
Priority: P2
Area: TUI
Depends On: none

## Why

Bare `shrimpy` opens the interactive TUI and resumes an active `tui` session, but it selects the default configured agent before resume happens. If the last interactive session was started through `shrimpy --agent <id>`, `shrimpy chat <agent>`, or `shrimpy agent tui <id>`, a later bare `shrimpy` resumes the default agent's `tui` session instead of the most recent agent-specific TUI session. The result feels like resume forgot which agent the user was talking to.

## Current State

- `cmdRootTui` passes `agentId: values.agent`; when no `--agent` is supplied, the value is undefined.
- `prepareForegroundSessionOpen` calls `runtime.getAgent(input.agentId)`, and `AppRuntime.getAgent(undefined)` returns the first configured agent.
- TUI sessions are agent-scoped canonical `local/main` sessions with manifests under `agents/<id>/sessions/local/`.
- `createSessionManager` resumes the active JSONL only inside the selected agent's session directory.
- `shrimpy_session_metadata` records `agentId`, but only after a session has already been opened, so it cannot help bare startup choose the agent.
- Live workspace evidence shows active `tui` sessions for multiple configured agents, with the newest active TUI session not necessarily belonging to the first configured agent.

## Build

- Add a narrow startup resolver for the root interactive command when no explicit `--agent` is provided.
- Resolve the most recent active `local/main` session across configured agents through the manifest-backed session catalog and lifecycle state.
- Use the resolved agent id before calling `prepareForegroundSessionOpen`, so the existing per-agent resume path opens the right session without changing Pi session storage.
- Preserve explicit agent selection for `shrimpy --agent <id>`, `shrimpy chat <agent>`, `shrimpy chat mechanic`, and `shrimpy agent tui <id>`.
- Keep the default first-configured-agent behavior when no active `tui` session exists anywhere.
- Decide and document whether `shrimpy "prompt"` without `--agent` should target the most recent TUI agent or the configured default agent.

## Boundaries

- Do not create a new session format or move session files.
- Do not read full transcripts to choose the agent; lifecycle state and file timestamps are enough.
- Do not change ephemeral `run` or gateway channel resume semantics.
- Do not make root startup depend on live workspace channel logs, runtime logs, or provider state.
- Do not add legacy command aliases or compatibility shims.

## Touches

- `src/commands/root.ts`
- `src/sessions/storage.ts`
- `src/sessions/service.ts` or a small new session-selection helper
- `test/root-command.test.ts` or a focused direct-session startup test
- `docs/reference/cli.md`
- `docs/reference/sessions.md`

## Done

- Starting `shrimpy agent tui career`, exiting, then running bare `shrimpy` opens the active `career` TUI session when it is the most recent active TUI session.
- Bare `shrimpy` still opens the first configured agent when there are no active `tui` sessions.
- Explicit agent commands ignore the resolver and keep targeting the requested agent.
- The resolver ignores archived sessions and does not inspect transcript text.
- Focused tests cover multi-agent active TUI selection, archived-session exclusion, explicit-agent precedence, and the no-session fallback.
- Reference docs describe how bare `shrimpy` chooses the agent it resumes.
