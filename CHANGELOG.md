# 🦐 Shrimpy Changelog

Public releases at `0.1.0` or later get a short lyrical aquatic release name/tagline.

## 🦐 0.3.0 - A Window in the Reef - Unreleased

### Breaking Changes

- Replaced `agents[].attention`, `--attention`, and `shrimpy agent attention ...` with `agents[].channelPolicy`, `--channel-policy`, and `shrimpy agent channel-policy ...`.
- Replaced top-level `briefing` config and `shrimpy context --briefing` with `context.turn` and `shrimpy context turn`; old `briefing` config now fails validation.
- Replaced scheduler/schedule config and state with agent-owned `watches.json`, `watchClock`, and `status.watchedWatches`; legacy schedule commands, scheduler state, and schedule/reminder provenance were removed.
- Changed channel delivery so addressing no longer bypasses membership, and `mode: none` no longer wakes on mentions or addressing; channel membership plus each agent's `channelPolicy` decides every wake.

### Installation

- Added a curl-friendly installer script and README setup path for installing a selected GitHub ref under `~/.local/share/shrimpy/app` and linking Shrimpy binaries into `~/.local/bin`.
- Added generated Bash/Zsh completion commands, cached completion state, and installer/interactive startup wiring so Zsh completion can be installed or refreshed automatically.

### CLI & Plumbing

- Added `shrimpy chat [agent]` as the plain TUI chat entrypoint for the default or selected agent.
- Added a shared command catalog and `shrimpy help all` so default help can stay focused while full help, group usage, and shell completion still expose the complete command surface.
- Added catalog-backed `--help` / `-h` output for command groups, nested namespaces, and leaf commands without loading workspace config.
- Cleaned up CLI help output across command groups and added `shrimpy completion bash|zsh|install|write-state|status`.

### Workspace & Setup

- Added shared and per-agent `vault/` and `projects/` workspace defaults plus setup-template guidance for saved files, reports, and project work folders.
- Changed `shrimpy setup` to set up missing model policy and context, while leaving configured workspaces unchanged.
- Changed first-run onboarding to launch the default `shrimpy` agent with the `setup` skill through the required `coding` model policy, preserving other agent policies without letting them block setup.
- Improved the generated `setup` skill so first-run guidance has a concrete inspect, ask, edit, validate, and handoff flow, including explicit consent before crawling outside official workspace paths.

### Agents, Skills & Tools

- Changed session startup to pass Shrimpy-selected skill entrypoints to Pi while keeping Pi's ambient skill discovery disabled.
- Added Pi-backed workspace and agent skill management, including `shrimpy skills list`, `show`, `add`, `install`, and `validate`.
- Added skill inspection and validation for agent-over-workspace shadowing, Pi loader diagnostics, id/name mismatches, unsafe layouts, and large visible skill sets.
- Added an `add-agent` setup skill for CLI-first agent creation, channel wiring, model/tool selection, and wake-policy verification.
- Added a built-in `coding-delegation` skill for preparing, dispatching, and supervising coding-agent handoffs.
- Added a `shrimpy-dev-reference-docs` source skill for using source/reference diffs to keep `docs/reference/` aligned with current behavior.
- Added a `shrimpy-dev-changelog` source skill for keeping `CHANGELOG.md` organized around release impact, categories, and user-facing wording.
- Added a `shrimpy-dev-pi-upgrade` source skill for assessing Pi dependency upgrades from a local Pi clone and writing a root-level upgrade plan.

### Turn Context

- Replaced briefing terminology with turn context across config, docs, CLI output, environment variables, and memory naming.
- Added `shrimpy context turn` plus `context.turn` settings for max size, unread channel context, and session recency status.
- Changed direct, TUI, gateway, and child-session turns to prefix live `<context>` envelopes onto the persisted user message, so session JSONL matches the model-facing input instead of hiding turn context in provider-only injection.
- Unified command-source execution for turn context previews and runtime turns, including inspectable items, error reporting, freshness state, and `--session-type` support for `shrimpy context sources run`.

### Channels, Surfaces & Agent Policy

- Added richer channel inspection with `shrimpy channels show` message counts, recent request-like messages, traceable source records, and `shrimpy channels search` filters for kind, sender, transport, actor, content type, addressing, watch, and source kind.
- Changed channel wake behavior from channel-owned attention to agent-owned `channelPolicy`, including base and per-channel modes, sender/actor/user filters, membership visibility checks, and inspectable wake/ignore explanations.
- Renamed the agent attention config and CLI surface to `channelPolicy` and `shrimpy agent channel-policy`, with `--channel-policy` on `agent add` and `agent set`.
- Scoped active publication helpers to gateway/channel sessions and clarified direct-session delivery, explicit `send_message` routing, and internal agent DM delivery.

### Watches & Gateway

- Replaced the scheduler/schedules surface with agent-owned watches in `agents/<id>/watches.json`; recurring work now uses one watch config concept instead of separate schedule, reminder, and scheduler state shapes.
- Added `shrimpy watches list|show|add|history|run` for inspecting, creating, and manually running watches, including target channels, expected channel-policy wake decisions, clock state, active runs, run history, diagnostics, and inspect commands.
- Added time-based message watches for the simple wake-an-agent case and command watches with `emit.policy` for observation-driven channel output.
- Added TUI `/status watches`, gateway/status watch summaries, watch-origin channel provenance, and turn-context breadcrumbs back to `shrimpy watches show` and `shrimpy watches history`.
- Changed fresh setup to seed focused `memory-management`, `journal-daily`, and `journal-compact` watches on the `maintenance` channel instead of a broad catch-all upkeep entry.
- Removed legacy scheduler modules, schedule commands, one-time schedule/reminder state, scheduler/reminder channel provenance, and the old heartbeat-specific compaction/status handling.

### Sessions, Models & TUI

- Added visible session messages when a session model changes, including previous/current model refs, thinking level, and resolved inference metadata.
- Improved session metadata recording after model switches so resumed sessions and inspection output reflect the active model.
- Added contained system prompt rendering so Pi skill inventory and runtime facts are represented as Shrimpy prompt sections with an explicit context boundary.
- Changed TUI `/new` handling to archive the previous TUI session file after Pi opens a fresh session, keeping session listing and restore behavior consistent.
- Fixed TUI startup so the configured Shrimpy theme is registered before Pi builds interactive components.
- Restored Shrimpy TUI turn-context display so persisted context envelopes are hidden by default and shown when `ctrl+o` expands tool output.

### Docs & Project Hygiene

- Added `npm run dev:setup*` helpers for repeatedly testing first-run setup in isolated `/tmp` homes/workspaces, with an opt-in Pi auth/model state copy for faster setup-skill iteration.
- Added skills and tool-model reference documentation plus Pi skill-handling research.
- Added channel, session, security, turn-context, and workspace storage reference documentation.
- Added backlog notes for cleaner CLI command structure, CLI autocomplete requirements, channel event routing, web search provider wrapping, agent-owned watches, model policy, workspace storage defaults, setup/model setup, and chat operation/status surfaces.
- Added research notes for web search API providers and in-OS agent sandboxing plus development guidance for Bash automation.
- Removed completed skill/context/schedule/channel/session/workspace backlog notes and the vision reconciliation tracker.
- Added Shrimpy emoji guidance to the default initialized `SOUL.md` template.

### Tests

- Expanded regression coverage for skill commands, turn context defaults and command sources, prompt-cache-stable routed sessions, direct/gateway delivery guidance, internal agent DM messaging, visible model-switch records, TUI session archiving, CLI catalog/completion, channel inspection/search, agent channel policy, watches, and workspace setup defaults.

## 🦐 0.2.0 - Lanterns in the Current - 2026-05-30

### TUI

- Added a Shrimpy-owned TUI layer on top of Pi interactive mode, including unified `/status` and `/settings` surfaces, model/thinking selectors, compact tool rows with Ctrl+O expansion, and the bottom-row Shrimpy activity indicator.

### Release & Dependencies

- Added release metadata from `package.json` so CLI help/version output follows the configured package version, description, and release name.
- Changed Pi integration to depend on registry-published `@earendil-works/*@0.77.0` packages, with the local patch/fork path documented as a private-only contingency.

### Models

- Added `shrimpy models` and `shrimpy models resolve` for inspecting agent defaults, Pi-visible provider models, session/channel model precedence, and missing default-model setup hints.
- Changed model defaults to require explicit provider/id pairs, restore saved model selections for local `tui` and `run` sessions, and record current model/inference metadata in session history.

### Agent Tools & Channels

- Added `shrimpy agent inspect`, `--disable-tools`, and tool capability policy reporting so agents can enable Shrimpy daemon tools while excluding Pi built-ins or other registered tools.
- Added active-channel publication tools: `reply`, `ask`, `notify`, and `report`. Publication intent now flows through channel egress, and Telegram low-urgency notifications can be delivered quietly.
- Added fine-grained `shrimpy agent attention set` and `shrimpy agent attention clear` mutators for base and per-channel attention policies.

### Runtime

- Changed gateway/status reporting to summarize generic scheduled runs across configured schedules instead of treating heartbeat as a runtime/status primitive; default schedule seeding now lives with setup defaults.
- Improved compaction summaries with session-agent context, looser summary formats, system-prompt-aware chunking, and stronger preservation of agent voice/workspace expectations.
- Improved model-variant inference handling so payload rewrites and sampler params apply only to the current model.

### Docs & Project Hygiene

- Added memory reference documentation, Discord DM adapter research, release-process docs, and new backlog notes for browser automation, worker sessions, durable waits, vault conventions, setup/security, and surface work.
- Removed completed backlog/tracking notes and stale VS Code workspace settings; added a checked-in `shrimpy.code-workspace`.

### Tests

- Expanded regression coverage for the new TUI surfaces, model commands/restoration, tool policy, attention mutators, compaction, Telegram outbound formatting, and channel delivery behavior.

## 🦐 0.1.0 - First Light in the Tidepool - 2026-05-30

### Release

- Initial alpha release of Shrimpy.
- APIs, CLI behavior, and workspace layout may change.
