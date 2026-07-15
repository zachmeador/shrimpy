# 🦐 TUI-004: Agent Session Navigator

Status: draft
Priority: P2
Area: TUI
Depends On: [TUI-007](tui-007-pi-patch-surface-reduction.md)

## Why

Shrimpy agents own separate prompt resources, memory, skills, watches, and Pi sessions. The TUI should make existing interactive sessions navigable without requiring the user to quit, relaunch with `--agent`, or remember exact session labels.

The first useful version is a small switcher for configured agents and their active `local/main` sessions. Archives, gateway-owned channel sessions, generated titles, and session-management actions are separate product decisions and should not inflate the initial navigator.

## Current State

- `shrimpy sessions list [session-id] --agent <id> --json` provides per-agent session inventory through the manifest-backed session catalog.
- Pi extensions can register `/agent` and present a focused selector through `ctx.ui.custom()` without adding another branch to Shrimpy's private editor-submit patch.
- Pi command handlers can call `ctx.switchSession(path, { withSession })`, and the interactive mode rebinds to the returned session.
- Shrimpy's runtime factory in `openSessionRuntime` closes over the launch agent's bootstrap and plan, so replacement sessions currently reopen with the original agent's resources.
- Shrimpy TUI surfaces also capture launch-time agent/session values, so status and settings can become stale after a cross-agent switch.
- Pi's current switch implementation tears down the active session before constructing and applying the replacement. Preflighting Shrimpy bootstrap/model policy can reduce failures, but it cannot guarantee that a failed switch leaves the current runtime intact.

## Build

- Add one workspace-wide inventory service for configured agents and each agent's active `local/main` session. Reuse the manifest, lifecycle, transcript, and Pi session-name readers already used by the CLI.
- Extend `shrimpy sessions list` with an all-agents mode so the TUI and shell inspect the same inventory shape.
- Keep initial rows compact: agent id, session name or first-prompt preview, updated age, and a current-session marker. Add metadata only when it helps choose between otherwise ambiguous rows.
- Register `/agent` through an in-process Pi extension factory. Bare `/agent` opens a searchable agent/session selector; `/agent <id>` filters or jumps to that agent.
- Present agents and their sessions as a keyboard-navigable hierarchy rather than a flat picker. The relationship between an agent and its sessions must remain visible while moving through the list.
- Selecting the current session is a no-op. Selecting another active `local/main` session switches the TUI without restarting it.
- Add a small per-session extension status for the active agent id using `ctx.ui.setStatus()`. This can ship independently of switching and must be rebuilt from the live target after a switch.
- Replace launch-time identity captures with a narrow live session-target abstraction used by the runtime factory and Shrimpy status/settings inputs.
- Resolve the switch failure contract before implementation: either add/use a Pi API that constructs and validates the replacement before teardown, or define an explicit Shrimpy rollback that can reopen the previous target. Do not claim that bootstrap preflight alone preserves the current session.

## Keyboard Navigation

- Up and down move focus through the visible agent and session rows.
- Right on a collapsed agent expands its sessions; right again moves focus into the first session when one exists.
- Left on a session returns focus to its parent agent; left on an expanded agent collapses its sessions.
- Enter on an agent toggles expansion. Enter on a session opens it, except that the current session remains a no-op.
- Search narrows the visible hierarchy without discarding parent-agent context for matching sessions, and arrow-key traversal continues to operate over the filtered rows.
- Keep the focused row, expanded agents, and current session visually distinct. Navigation must not depend on a mouse or require typing exact agent/session ids.

## MVP Boundaries

- Include configured agents and active `local/main` sessions only.
- Do not restore archives from the selector. Archive restore remains available through the session lifecycle CLI until a later navigator slice proves useful.
- Do not list or attach gateway-owned channel sessions. Their ownership, staleness, handoff, and fork semantics belong in a separate backlog item.
- Do not add generated session titles. Use Pi's existing session name and a short first-prompt preview when no name exists.
- Do not edit agent configuration from `/agent`.
- Do not create a parallel session registry or session format.
- Do not add another private `InteractiveMode` command router; land the revised TUI-007 command ownership first.

## Open Decision

Pi's current `switchSession` ordering is the remaining product/runtime decision. TUI-004 stays `draft` until the implementation can state how a failed cross-agent replacement preserves or restores the previous session. This is a real runtime requirement, not a contract check that preflight can satisfy.

## Touches

- `src/sessions/catalog.ts`
- `src/sessions/transcript-store.ts`
- `src/sessions/open.ts`
- `src/sessions/pi-resources.ts`
- `src/tui/interactive.ts`
- A focused agent-navigator extension module
- Session inventory and interactive switch tests
- CLI/session reference docs

## Done

- The CLI can list configured agents and their active `local/main` sessions through one inspectable inventory service.
- `/agent` lets the user search configured agents and switch to an active session without leaving the TUI.
- Up/down/left/right traverse the agent/session hierarchy according to the documented keyboard contract, including while search is filtering the list.
- Cross-agent sessions open with the selected agent's prompt resources, model policy, tools, context assembly, and storage.
- The footer identifies the live agent before and after switches.
- Shrimpy status/settings inputs read the live target after a switch.
- A failed switch demonstrably preserves or restores the previous session according to the chosen runtime contract.
- Archives and gateway/channel sessions remain out of scope.
- Focused tests cover hierarchy expansion/collapse, parent/child focus movement, filtered arrow-key traversal, current-session no-op, same-agent switch, cross-agent switch, explicit failure recovery, and CLI/TUI inventory agreement.
