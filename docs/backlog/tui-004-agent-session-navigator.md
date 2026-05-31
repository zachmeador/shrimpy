# 🦐 TUI-004: Agent Session Navigator

Status: draft
Priority: P2
Area: TUI

## Why

Shrimpy agents each own prompt resources, memory, skills, schedules, and Pi session transcripts under `agents/<id>/`. The TUI should make that environment navigable without requiring the user to quit, relaunch with `--agent`, or remember exact session labels.

Now that Shrimpy has more control over the Pi TUI instance, `/agent` can become an interactive path for moving between agents and their sessions. This should feel like normal Shrimpy navigation, not a second control plane over sessions.

## Build

- Add `/agent` as an interactive TUI command.
- Show a searchable list of configured agents in the current workspace.
- Enter on an agent opens that agent's session list.
- Enter on a session resumes or opens it in the current TUI.
- Show useful row metadata: agent id, agent root, configured model/thinking, session label, session type/channel when known, active/archive state, updated age, session name, and first prompt preview.
- Keep `/status agents` as a read-only inspection path; `/agent` is the navigable workflow.
- Preserve CLI coverage first, so the TUI navigator reads the same service surface an agent can inspect from the shell.

## Safe MVP

- Directly switch between `tui` sessions for any configured agent.
- Include archived sessions in the list, with explicit restore/resume behavior.
- Show gateway/channel sessions as visible records, but do not silently attach to a session that may be owned by the running gateway.
- If a gateway/channel session is selected, offer a clear fork/open-local path first. A direct attach can come later only with explicit confirmation and a well-defined writer-safety story.

## Runtime Boundary

Pi already exposes a selector replacement surface and session switching inside the current `AgentSessionRuntime`, but Shrimpy's current TUI runtime is opened for one agent at launch. Cross-agent navigation needs a Shrimpy-owned session target model that can rebuild bootstrap, model defaults, tool policy, prompt prep, and context assembly for the selected agent.

The selected session path must not just call Pi's existing `switchSession()` against the old runtime factory if the target belongs to another agent. It must resolve the target agent first, then open a runtime with that agent's root and policy.

## Slices

- TUI-004A: Add an agent/session inventory service that lists all configured agents and their session files, including lifecycle state and Shrimpy session metadata.
- TUI-004B: Add CLI coverage, likely `shrimpy agent sessions <id> [--json]` or an expanded `shrimpy sessions list --agent <id> --all --json`.
- TUI-004C: Refactor TUI session replacement so a selected target can reopen the Pi runtime as a different Shrimpy agent.
- TUI-004D: Add the `/agent` selector flow in the Shrimpy TUI command surface.
- TUI-004E: Define and implement gateway/channel-session selection semantics: disabled, fork local, restore archived, or explicitly attach.

## Boundaries

- Do not fork Pi's full TUI for this.
- Do not create a parallel session format or session registry.
- Do not silently write to a gateway-owned active session from the TUI.
- Do not make `/agent` edit agent config; configuration remains in the agent CLI/settings surface.
- Do not add legacy aliases or compatibility shims.

## Implementation Notes

- Likely files: `src/sessions/service.ts`, `src/sessions/storage.ts`, `src/sessions/direct.ts`, `src/sessions/open.ts`, `src/tui/shrimpy-command-surface.ts`, and a new `src/tui/shrimpy-agent-navigator.ts`.
- Current Shrimpy TUI launch captures the active agent in `runAgentTuiSession`; cross-agent switching needs that capture point to become a target resolver.
- Current session summaries are per-agent and mostly active/archive paths. The navigator needs richer per-file metadata and should reuse Shrimpy custom metadata entries where present.
- Pi's own `/resume` remains a Pi session selector for the current runtime/session directory. `/agent` should be the Shrimpy workspace-level navigator.
- Related: [TUI-001](tui-001.md) for command-surface coherence and the completed command-output polish work for selector/output patterns.

## Done

- `/agent` lets the user choose a configured agent and then a session from that agent without leaving the TUI.
- Cross-agent session selection opens with the selected agent's prompt resources, model defaults, tool policy, context assembly, and session storage.
- Gateway/channel sessions are visible but protected from accidental concurrent writes.
- CLI and TUI session listings agree on agent/session metadata.
- Focused tests or documented manual verification cover same-agent TUI resume, cross-agent TUI resume, archived-session restore, and gateway-session selection behavior.
