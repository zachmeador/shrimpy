# 🦐 TUI-011: Terminal Title Agent Label

Status: draft
Priority: P2
Area: TUI
Depends On: none

## Why

The Shrimpy TUI currently inherits Pi's terminal window/tab title, so terminal tabs are labeled with Pi's own title instead of the Shrimpy agent the user is talking to. Multiple Shrimpy agents can have active TUI sessions, and a title like `shrimpy - <agent>` would make tabs easier to identify without reading the TUI body.

## Current State

- Pi calls `InteractiveMode.updateTerminalTitle()` during interactive rebind and when session info changes. In the current local Pi build, the default title is based on `APP_TITLE`, session name, and cwd; `APP_TITLE` is the Pi symbol when Pi is running under its normal config.
- Pi exposes a sanctioned TUI extension API: `ctx.ui.setTitle(title)` sets the terminal window/tab title.
- Shrimpy already loads per-session Pi extension factories from `src/sessions/pi-resources.ts`, but those factories do not currently receive the Shrimpy agent id.
- `runAgentTuiSession` knows the prepared agent id before constructing `InteractiveMode`, and `createShrimpyResourceLoader` is called from both bootstrap and session-open paths.
- TUI-004 will eventually make the active TUI target mutable across agents; this item can ship first for single-agent launch, then follow the same live target/rebuilt resource loader shape when cross-agent switching lands.

## Build

- Add a Shrimpy-owned terminal-title extension or extension factory that sets the title to `shrimpy - <agent id>` for TUI sessions.
- Thread the resolved Shrimpy agent id into `createShrimpyResourceLoader` so the title extension can be built from normal session state instead of reading workspace config again.
- Verify where Pi resets the terminal title after extension binding. If `session_start` is overwritten by Pi's later `updateTerminalTitle()` call, use the smallest durable Shrimpy hook or upstream Pi ask needed to apply the title after that reset.
- Reapply the title after Pi session changes that can reset it, including new/resume/fork and later TUI-004 cross-agent switches.
- Use the agent id as the stable label for now. If Shrimpy later adds a separate display-name field, this title can switch to that field deliberately.

## Boundaries

- Do not patch raw OSC terminal escape sequences when Pi's `ctx.ui.setTitle()` can do the write.
- Do not fork or replace Pi's terminal-title updater.
- Do not add a user config surface until there is a second concrete title format to support.
- Do not make this depend on session-title summarization; the title identifies the active Shrimpy agent, not the conversation topic.

## Touches

- `src/sessions/pi-resources.ts`
- `src/sessions/bootstrap.ts`
- `src/sessions/open.ts`
- `src/tui/interactive.ts` only if a post-rebind Shrimpy hook is needed
- `test/tui-header-extension.test.ts` or a focused title-extension test

## Done

- Starting `shrimpy`, `shrimpy chat <agent>`, or `shrimpy agent tui <agent>` sets the terminal window/tab title to `shrimpy - <agent id>`.
- Pi session new/resume/fork operations keep the Shrimpy title after any Pi title refresh.
- If TUI-004 cross-agent switching has landed, switching agents updates the title to the new active agent.
- The implementation uses `ctx.ui.setTitle()` or a documented sanctioned Pi hook; any private fallback is covered by the TUI-007 patch contract.
- Focused tests or documented manual verification cover launch and at least one Pi title-reset path.
