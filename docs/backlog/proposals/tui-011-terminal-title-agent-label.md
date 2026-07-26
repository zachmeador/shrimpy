---
status: draft
priority: P1
area: TUI
depends_on:
  - upstream Pi persistent terminal-title hook
---

# 🦐 TUI-011: Terminal Title Agent Label

## Why

The Shrimpy TUI currently leaves Pi's `π` application title in the terminal tab. This makes an active Shrimpy session visibly present itself as the underlying dependency instead of the product the user launched.

Multiple Shrimpy agents can also have active TUI sessions, so the terminal tab should identify the active agent without requiring the user to read the TUI body.

The active-agent header addresses the in-TUI version of this need through a sanctioned API, but it does not fix the surrounding terminal surface. Removing the Pi identity is the baseline requirement; adding the active agent while retaining useful session context is the complete outcome.

## Current State

- Pi builds its title from its application title, Pi session name, and cwd.
- Pi derives that application title from its own installed package metadata. Shrimpy's root `piConfig.name` does not rebrand the dependency, so the title remains `π`.
- `ctx.ui.setTitle(title)` performs a one-shot terminal-title write.
- During interactive rebind, Pi binds extensions and dispatches their session lifecycle handlers, then calls its private `updateTerminalTitle()`. A title set from `session_start` is therefore overwritten immediately.
- Pi refreshes the title again when session information changes.
- Preserving a Shrimpy title today would require another private post-rebind/title patch, directly opposing TUI-007's patch-reduction goal.

## UX Implications

Launching `shrimpy tui` should never leave a Pi symbol or Pi product name in the terminal tab. The title should identify Shrimpy immediately, include the active agent when practical, retain useful session-name or cwd context, and update after new, resume, fork, and `/agents` cross-agent switches. Title changes must not flicker back to Pi during normal session lifecycle updates.

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
- No Shrimpy TUI terminal title displays Pi's `π` application identity.
- Shrimpy terminal tabs identify the active agent while retaining useful session-name or cwd context.
- Pi title refreshes and Shrimpy cross-agent switches update the title through the sanctioned hook.
- Focused tests or documented manual verification cover launch and a title-reset path.
