# 🦐 TUI-004: Agent Session Navigator

Status: draft
Priority: P2
Area: TUI

## Why

Shrimpy agents each own prompt resources, memory, skills, watches, and Pi session transcripts under `agents/<id>/`. The TUI should make that environment navigable without requiring the user to quit, relaunch with `--agent`, or remember exact session labels.

Now that Shrimpy has more control over the Pi TUI instance, `/agent` can become an interactive path for moving between agents and their sessions. This should feel like normal Shrimpy navigation across existing agents and sessions.

## Current State

- CLI session inventory exists through `shrimpy sessions list [channel] --agent <id> --json`, backed by `summarizeAgentSessions`. It is per-agent only, and already returns active sessions, recent archives, and gateway lane state (`gatewayLanes` with queue depth and current turn).
- Session files already carry rich Shrimpy metadata: `shrimpy_lifecycle` entries for lifecycle state, and `shrimpy_session_metadata` entries recording agent id, channel, session type, and current model. Model switches append fresh metadata entries via `wrapModelMetadataRecording`, so the last entry reflects the current model.
- The TUI command surface has Shrimpy-owned `/status`, `/settings`, `/model`, `/thinking`, and `/changelog` hooks, but no `/agent` navigator.
- The Pi footer shows cwd, token stats, context usage, git branch, and extension statuses set via `ctx.ui.setStatus()`; nothing identifies the active agent.
- The TUI runtime factory in `openSessionRuntime` closes over one agent's `(bootstrap, plan)`, so Pi session replacement always reopens as the launch agent.
- `installShrimpyCommandSurface` and `installShrimpySettingsSelector` capture `agentId`, `channel`, `sessionType`, and `cwd` at install time.
- There is no workspace-wide all-agent session inventory service.

## Build

- Add `/agent` as an interactive TUI command: bare `/agent` opens a searchable list of configured agents, `/agent <id>` jumps straight to that agent's session list.
- Enter on an agent opens that agent's session list. Enter on a session opens it in the current TUI.
- Show useful row metadata: agent id, agent root, configured model/thinking, session label, session type/channel when known, active/archive state, updated age, current model, session name when present, and first prompt preview.
- Mark the session currently open in this TUI; selecting it is a no-op.
- Show the active agent id in the Pi footer status line so the user always knows which agent they are chatting with, before and after switches.
- Add `/agent` to the command surface help lines.
- Keep `/status agents` as a read-only inspection path; `/agent` is the navigable workflow.
- Preserve CLI coverage first, so the TUI navigator reads the same inventory service an agent can inspect from the shell.

## Safe MVP

- Directly switch between `tui` sessions for any configured agent.
- Include archived sessions in the list. Selecting an archive restores it to active first, matching `executeSessionLifecycleAction` restore semantics (move the archive back, archive the current active), then opens it.
- Show gateway/channel sessions as visible records, but do not attach to a session that may be owned by the running gateway. Offer a clear fork/open-local path. A direct attach can come later only with explicit confirmation and a well-defined writer-safety story.

## Runtime Boundary

Pi's `AgentSessionRuntime.switchSession(sessionPath)` already does most of the work: it reuses the runtime factory stored at construction, tears down the current session, builds the next one, and rebinds the TUI. `InteractiveMode.session` is a live getter into the runtime, and InteractiveMode registers `setRebindSession` for UI rebinding after replacement. The blocker is only that Shrimpy's factory in `openSessionRuntime` closes over one agent's `(bootstrap, plan)`.

The shape: make the factory consult a mutable session target resolver. The navigator resolves the target agent, rebuilds bootstrap and plan through the normal Shrimpy session-open path (including the Pi turn-context hook described in [turn-context.md](../reference/turn-context.md)), sets the target, then calls `switchSession()`. Pi's teardown/rebind plumbing handles the rest; the navigator does not restart the TUI and does not rebuild prompt preparation itself.

Failure semantics matter: Pi tears down the current session before creating the next and propagates creation errors to the caller. Cross-agent opens can fail in ways same-agent resume cannot (no usable model under the target's policy, broken agent files). Pre-flight the target's bootstrap and plan before calling `switchSession()`; a failed open must leave the current session intact.

The Shrimpy TUI surfaces capture agent identity at install time and must instead read the active target live, or `/status` and `/settings` report the old agent after a switch.

## Slices

- TUI-004A: Add a workspace-wide agent/session inventory service: all configured agents, session files per channel, lifecycle state, metadata from the last `shrimpy_session_metadata` entry via `findLastCustomEntry`, session name from Pi's `session_info` entry (later MEM-001 generated titles), first-prompt preview, and gateway lane state. First-prompt preview is the only new extraction; the rest reuses existing records.
- TUI-004B: Extend `shrimpy sessions list` with a workspace-wide all-agents mode (for example `--all`), reading the same inventory service. Keep session inventory on one CLI surface so CLI and TUI listings cannot drift.
- TUI-004C: Add the session target resolver: the runtime factory consults a mutable target, Shrimpy TUI surfaces read the active target live, and cross-agent opens pre-flight the target and recover to the current session on failure.
- TUI-004D: Add the `/agent` selector flow in the Shrimpy TUI command surface, including help lines, `/agent <id>` direct jump, and the current-session marker.
- TUI-004E: Define gateway/channel-session selection semantics: surface gateway lane state (queue depth, current turn) in the selector, define staleness rules for the runtime-state file, and wire the fork/open-local path. Direct attach is a later, explicitly confirmed step.
- TUI-004F: Footer agent indicator: a Shrimpy extension factory closing over the agent id calls `ctx.ui.setStatus()` on session start. Independent of the other slices and can ship first; under TUI-004C the resource loader is rebuilt per target, so the indicator stays correct across switches.

## Boundaries

- Do not fork Pi's full TUI for this.
- Do not create a parallel session format or session registry.
- Do not silently write to a gateway-owned active session from the TUI.
- Do not make `/agent` edit agent config; configuration remains in the agent CLI/settings surface.
- Do not add legacy aliases or compatibility shims.

## Implementation Notes

- Likely files: `src/sessions/service.ts`, `src/sessions/storage.ts`, `src/sessions/open.ts`, `src/sessions/direct.ts`, `src/tui/interactive.ts`, `src/tui/shrimpy-command-surface.ts`, and a new `src/tui/shrimpy-agent-navigator.ts`.
- The agent capture point is the factory closure over `(bootstrap, plan)` in `openSessionRuntime` (`src/sessions/open.ts`). `runAgentTuiSession` and the surface installers capture agent identity again for display; both captures become reads of the live target.
- Footer indicator seam: extension statuses set via `ctx.ui.setStatus(key, text)` land in Pi's `FooterDataProvider` and render on the built-in footer's status line. Shrimpy's extension factories in `src/sessions/pi-resources.ts` already close over per-session state (`createTurnContextExtensionFactory`), so the indicator follows the same pattern with the agent id.
- Pi's own `/resume` remains a Pi session selector for the current runtime/session directory. `/agent` is the Shrimpy workspace-level navigator.
- Related: the completed Shrimpy command-surface work for TUI coherence and the completed command-output polish work for selector/output patterns.
- Related: direct TUI, direct `run`, and gateway turns are aligned through Pi's context hook; the navigator preserves that boundary when switching targets.

## Done

- `/agent` lets the user choose a configured agent and then a session from that agent without leaving the TUI; `/agent <id>` jumps to that agent.
- Cross-agent session selection opens with the selected agent's prompt resources, model defaults, tool policy, context assembly, and session storage.
- The footer shows the active agent id at all times, and it updates on cross-agent switch.
- After a switch, `/status` and `/settings` report the new agent.
- A failed cross-agent open leaves the current session intact.
- Switching away and back round-trips cleanly, with the previous runtime fully torn down.
- Gateway/channel sessions are visible but protected from accidental concurrent writes.
- CLI and TUI session listings read the same inventory service and agree on agent/session metadata.
- Focused tests or documented manual verification cover same-agent TUI resume, cross-agent TUI resume, archived-session restore, failed-open recovery, and gateway-session selection behavior.
