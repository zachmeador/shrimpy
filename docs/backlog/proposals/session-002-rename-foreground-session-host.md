---
status: todo
priority: P3
area: Sessions
depends_on:
  - SECURITY-006
---

# 🦐 SESSION-002: Rename The Foreground Session Host

## Why

`src/sessions/foreground.ts` is misnamed. It is the in-process session host: open a session in the current process and optionally run one prompt through it. Its callers include the TUI and `shrimpy run`, but also `src/workers/runner.ts`, whose detached background children use the same functions — nothing about the module is foreground-specific.

SECURITY-006 names in-process execution as an explicit runner backend. When that runner module lands, this module's name should match the vocabulary instead of implying an interactivity distinction that does not exist.

## Current State

- `src/sessions/foreground.ts` exports `prepareForegroundSessionOpen`, `openForegroundAgentSession`, and `runForegroundAgentPrompt`.
- Importers: `src/commands/run.ts`, `src/tui/interactive.ts`, `src/tui/session-target.ts`, `src/workers/runner.ts`.

## Build

- Rename the module and its exports around "in-process" or the settled runner-backend term from SECURITY-006, for example `src/sessions/in-process.ts` with `runAgentPromptInProcess`, or fold it into the runner module if that is where the in-process backend implementation ends up living.
- Update all importers. No behavior change, no re-export shim at the old path.
- Do the rename together with or immediately after the runner module so the name is chosen once.

## UX Implications

None. This is an internal rename with no CLI, config, or behavior change.

## Touches

- `src/sessions/foreground.ts` and its four importers
- `docs/reference/sessions.md` or `runtime.md` if either names the module

## Done

- No module or export implies "foreground" for in-process session hosting.
- All callers use the new name; the old path is gone with no shim.
- Tests and build pass unchanged.
