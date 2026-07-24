# 🦐 TUI-011: Terminal Title Agent Label

Status: draft
Priority: P3
Area: TUI
Depends On: upstream Pi persistent terminal-title hook

## Why

Multiple Shrimpy agents can have active TUI sessions, and terminal tabs should identify the active agent without requiring the user to read the TUI body.

The footer agent indicator in TUI-004 addresses the in-TUI version of this need through a sanctioned API. Terminal-tab polish can wait until Pi exposes a durable title override or formatter.

## Current State

- Pi builds its title from its application title, Pi session name, and cwd.
- `ctx.ui.setTitle(title)` performs a one-shot terminal-title write.
- During interactive rebind, Pi binds extensions and dispatches their session lifecycle handlers, then calls its private `updateTerminalTitle()`. A title set from `session_start` is therefore overwritten immediately.
- Pi refreshes the title again when session information changes.
- Preserving a Shrimpy title today would require another private post-rebind/title patch, directly opposing TUI-007's patch-reduction goal.

## Build

- Ask Pi for a persistent terminal-title override or formatter hook that is applied by `updateTerminalTitle()` after rebind and session-info changes.
- Once available, provide the active Shrimpy agent id through a per-session extension factory or live session-target input.
- Preserve useful Pi context in the title rather than replacing it with only an agent id. A likely shape is `shrimpy:<agent> — <session name or cwd>`, subject to the upstream hook's contract.
- Update the title after new/resume/fork and any later TUI-004 cross-agent switch through the same sanctioned hook.

## Boundaries

- Do not patch raw OSC escape sequences.
- Do not add a private post-rebind or `updateTerminalTitle()` patch solely for tab polish.
- Do not add title-format configuration until there is a second concrete supported format.
- Do not depend on generated session titles; use Pi's existing session name or cwd.

## Done

- Pi exposes a durable title override/formatter hook.
- Shrimpy terminal tabs identify the active agent while retaining useful session-name or cwd context.
- Pi title refreshes and Shrimpy cross-agent switches update the title through the sanctioned hook.
- Focused tests or documented manual verification cover launch and a title-reset path.
