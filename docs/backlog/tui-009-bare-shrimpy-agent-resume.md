# 🦐 TUI-009: Bare Shrimpy Agent Resume

Status: todo
Priority: P2
Area: TUI
Depends On: none

## Why

Bare `shrimpy` opens the interactive TUI, but it selects the default configured agent before Pi resumes that agent's session. If the most recent interactive session belongs to another agent, bare startup feels like it forgot who the user was talking to.

## Current State

- `cmdRootTui` leaves `agentId` undefined when no `--agent` is supplied.
- `prepareForegroundSessionOpen` calls `runtime.getAgent(input.agentId)`, and `AppRuntime.getAgent(undefined)` returns the first configured agent.
- Interactive sessions use each agent's canonical `local/main` session. Its manifest is stored under the encoded `agents/<id>/sessions/local/<name>/<profile>/session.json` path.
- `openSessionManager` resumes only inside the agent directory selected before session open.
- The manifest-backed catalog and transcript helpers can identify active sessions and their update times without reading full transcript content.

## Build

- Add a narrow resolver for bare, promptless root TUI startup when no explicit `--agent` is provided.
- After the app runtime is available and before `prepareForegroundSessionOpen`, resolve the configured agent whose active `local/main` session was updated most recently.
- Feed that agent id into the existing foreground-open path so normal per-agent Pi resume behavior remains unchanged.
- Keep the first configured agent as the fallback when no configured agent has an active `local/main` session.
- Preserve explicit agent selection for `shrimpy --agent <id>`, `shrimpy chat <agent>`, `shrimpy chat mechanic`, and `shrimpy agent tui <id>`.
- Keep `shrimpy "prompt"` without `--agent` on the configured default agent. Only bare, promptless `shrimpy` follows the most recently active interactive agent; prompt targeting should remain predictable.

## Boundaries

- Do not create a new session format or move session files.
- Do not read full transcripts to choose the agent.
- Do not change ephemeral `run` or gateway/channel resume semantics.
- Do not make startup depend on channel logs, runtime logs, provider state, or Shrimpy session metadata appended after open.
- Do not add legacy command aliases or compatibility shims.

## Touches

- Root TUI/session launch orchestration after `AppRuntime` creation
- `src/sessions/catalog.ts` and existing transcript/manifest helpers as needed
- A focused root interactive startup test
- `docs/reference/cli.md`
- `docs/reference/sessions.md`

## Done

- Starting an interactive session for a non-default agent, exiting, then running bare `shrimpy` resumes that agent when its active `local/main` session is the most recent.
- Bare `shrimpy` opens the first configured agent when no active `local/main` session exists.
- `shrimpy "prompt"` still targets the configured default agent unless `--agent` is explicit.
- Explicit agent commands ignore the resolver.
- Archived and channel sessions do not influence selection, and the resolver does not inspect transcript text.
- Focused tests cover multi-agent recency, archived-session exclusion, explicit-agent precedence, prompted-root behavior, and the no-session fallback.
- Reference docs describe the bare-startup resume rule.
