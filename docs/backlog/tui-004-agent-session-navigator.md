# 🦐 TUI-004: Agent Session Navigator

Status: review
Priority: P2
Area: TUI
Depends On: none

## Why

Shrimpy agents own separate prompt resources, memory, skills, watches, and Pi sessions. The TUI should make existing interactive sessions navigable without requiring the user to quit, relaunch with `--agent`, or remember exact session labels.

The first useful version is a switcher for configured agents and their active local interactive sessions. Restricting every agent to `local/main` would make the hierarchy mostly decorative and prevent same-agent traversal. Archives, setup sessions, workers, gateway-owned channel sessions, generated titles, and session-management actions remain separate product decisions.

## Current State

- `shrimpy sessions list --all-agents [--json]` and `/agents` use one manifest-backed inventory of configured agents and active local interactive sessions.
- `/agents` is a public Pi extension command. It opens a focused custom selector with Pi's border, theme, keybinding hint, search, escape, and list conventions.
- The selector implements the documented four-arrow hierarchy, keeps matching sessions under their parent agents while filtering, and marks the live agent and session.
- Selecting a configured agent with no active sessions prepares a blank durable `local/main` manager and opens it through Pi's switch lifecycle, leaving the previous agent's session active.
- A live session-target controller rebuilds each selected runtime from the target agent's bootstrap and session plan. The compact startup header, Shrimpy status, settings, and cwd read that live target after a switch.
- Target preflight happens before `ctx.switchSession()`. If target construction still fails after Pi tears down the active runtime, Shrimpy reopens the previous session and reports the failed target and restoration.

## Build

- Add one workspace-wide inventory service for configured agents and each agent's active local interactive sessions. Reuse the manifest, lifecycle, transcript, and Pi session-name readers already used by the CLI.
- Extend `shrimpy sessions list` with an all-agents mode so the TUI and shell inspect the same inventory shape.
- Keep initial rows compact: agent id, session name or first-prompt preview, updated age, and a current-session marker. Add metadata only when it helps choose between otherwise ambiguous rows.
- Register `/agents` through an in-process Pi extension factory. Bare `/agents` opens a searchable agent/session selector; `/agents <id>` filters or jumps to that agent.
- Present agents and their sessions as a keyboard-navigable hierarchy rather than a flat picker. The relationship between an agent and its sessions must remain visible while moving through the list.
- Selecting the current session is a no-op. Selecting another active local interactive session switches the TUI without restarting it.
- Selecting an agent with no sessions prepares and opens a new durable `local/main` session for that agent.
- Put the active agent id on the existing first line of Shrimpy's startup header, rebuilt from the live target after a switch. Do not reserve a permanent footer/status row for identity.
- Replace launch-time identity captures with a narrow live session-target abstraction used by the runtime factory and Shrimpy status/settings inputs.
- Resolve the switch failure contract before implementation: either add/use a Pi API that constructs and validates the replacement before teardown, or define an explicit Shrimpy rollback that can reopen the previous target. Do not claim that bootstrap preflight alone preserves the current session.

## UX Implications

Bare `/agents` opens with every configured agent visible, its active local sessions expanded, and the current session focused. `/agents <id>` starts with that agent filter applied. Enter on an agent with no sessions opens a fresh durable `local/main` chat for that agent; the row says this explicitly instead of behaving like a dead end. The active agent appears on the existing first header line, so identity scrolls away with the startup header and never adds a permanent footer row or increases the header height. The selector follows Pi's menu expectations: direct typing searches, Backspace edits the query, the first Escape clears search, a second Escape closes the menu, and Enter activates the focused row. Existing `/new`, `/resume`, `/settings`, model, thinking, tool expansion, turn-context expansion, footer shrimp, and activity-indicator behavior must remain unchanged.

- Up and down move focus through the visible agent and session rows.
- Right on a collapsed agent expands its sessions; right again moves focus into the first session when one exists.
- Left on a session returns focus to its parent agent; left on an expanded agent collapses its sessions.
- Enter on an agent toggles expansion. Enter on a session opens it, except that the current session remains a no-op.
- Search narrows the visible hierarchy without discarding parent-agent context for matching sessions, and arrow-key traversal continues to operate over the filtered rows.
- Keep the focused row, expanded agents, and current session visually distinct. Navigation must not depend on a mouse or require typing exact agent/session ids.

## MVP Boundaries

- Include configured agents and active local interactive sessions only. Exclude `local/setup`, channel, worker, in-memory, missing, and archived transcripts.
- Do not restore archives from the selector. Archive restore remains available through the session lifecycle CLI until a later navigator slice proves useful.
- Do not list or attach gateway-owned channel sessions. Their ownership, staleness, handoff, and fork semantics belong in a separate backlog item.
- Do not add generated session titles. Use Pi's existing session name and a short first-prompt preview when no name exists.
- Do not edit agent configuration from `/agents`.
- Do not create a parallel session registry or session format.
- Do not add another private `InteractiveMode` command router. Register `/agents` through Pi's extension command and custom UI APIs.

## Switch Failure Contract

Pi's `switchSession` tears down the active runtime before constructing the replacement. Shrimpy therefore prepares the selected target before invoking Pi, retains the previous prepared target and session file during replacement, and reopens that previous target if the selected runtime fails to construct. If restoration also fails, the combined error is surfaced instead of claiming either target is live. Focused tests cover successful replacement and explicit restoration.

## Touches

- `src/sessions/catalog.ts`
- `src/sessions/open.ts`
- `src/tui/interactive.ts`
- `src/tui/agent-session-navigator.ts`
- `src/tui/agent-session-selector.ts`
- `src/tui/session-target.ts`
- Session inventory, selector, navigator, and rollback tests
- CLI, runtime, and session reference docs

## Done

- The CLI can list configured agents and their active local interactive sessions through one inspectable inventory service.
- `/agents` lets the user search configured agents and switch to an active session without leaving the TUI.
- Selecting a configured agent with zero sessions opens its new durable `local/main` chat without leaving the TUI or creating a transcript before the first turn.
- Up/down/left/right traverse the agent/session hierarchy according to the documented keyboard contract, including while search is filtering the list.
- Cross-agent sessions open with the selected agent's prompt resources, model policy, tools, context assembly, and storage.
- The existing first header line identifies the live agent before and after switches without adding a row.
- Shrimpy status/settings inputs read the live target after a switch.
- A failed switch demonstrably preserves or restores the previous session according to the chosen runtime contract.
- Archives and gateway/channel sessions remain out of scope.
- Focused tests cover hierarchy expansion/collapse, parent/child focus movement, filtered arrow-key traversal, current-session no-op, same-agent switch, cross-agent switch, explicit failure recovery, and CLI/TUI inventory agreement.
