# 🦐 Shrimpy Changelog

Public releases at `0.1.0` or later get a short lyrical aquatic release name/tagline.

## 🦐 0.4.1 - Unreleased

### CLI & Plumbing

- Added `shrimpy worker backends` to inspect and refresh persisted Codex, Claude Code, and Pi worker backend availability.
- Added `shrimpy worker start|list|status|read|tail|send|wait|cancel|close` for detached, file-backed worker records, with Codex `exec --json` and Shrimpy/Pi direct-session backend paths. Claude Code is recorded as deferred.
- Added top-level `latestTurn`, `artifactPaths`, and `commands` shortcuts to single-worker JSON output.
- Improved worker summaries with goal, status, key actions, files touched, blockers, and latest result sections.

### Turn Context

- Added owned worker outcome context with current-session/current-channel relevance tiers and compact counts for other completed, blocked, failed, or cancelled workers.
- Added worker outcome counts to generated session status so agents notice completed, blocked, failed, and cancelled workers during background wake turns.

### Workspace & Setup

- Improved gateway service installs and startup PATH handling so watch actions and gateway sessions can resolve `shrimpy` from `~/.local/bin`.
- Added `state/worker-backends.json` during setup so worker backend availability is recorded without making external CLIs required.
- Added `state/workers.json` and `runtime/workers/` for inspectable coding worker records and captured worker artifacts.
- Added per-turn worker `--timeout-ms` handling so long-running starts or amendments can be cancelled automatically.
- Changed worker cancel, close, and stale reconciliation to terminate recorded process groups and escalate to `SIGKILL` when they do not exit after a grace period.
- Added `coding-delegation` as an all-agent source-default skill gated on Bash, while keeping workspace-local overrides available under `skills/`.
- Removed the unused `run_child` daemon tool surface.

## 🦐 0.4.0 - Tides Pull Both Ways - 2026-06-11

### Installation

- Changed installer-oriented development to use a git-backed checkout path, making installed refs easier to inspect, update, and recover.

### Workspace & Setup

- Changed fresh installs without `~/.shrimpy-workspace.json` to default the workspace to `~/.shrimpy/` instead of the launch directory.
- Changed setup defaults so `vault/` and `projects/` are created under each agent instead of as shared workspace-level directories.
- Removed scaffolded agent identity context files from setup templates so persistent agent identity lives in the agent-owned instruction files.

### Agents, Skills & Tools

- Reworked `shrimpy skills add` into a package installation flow for local files, directories, URLs, and GitHub sources, with provenance, `--dry-run`, `--path`, `--ref`, `--all`, and update detection.
- Added `shrimpy skills update`, `bind`, `unbind`, and `new` so installed skill packages can be refreshed, enabled, disabled, and locally authored without conflating package management with scaffolding.
- Added managed skill package state, source hashing, GitHub package discovery, and agent/workspace bindings for installed skills.

### Channels & Agent Policy

- Added channel manifests and transport bindings so surface-backed channels can declare how outbound messages should be delivered.
- Added a channel outbox with cursors, delivery receipts, retry state, and skipped/failed delivery records for outbound surface messages.
- Changed channel outbox startup to seed missing cursors at current channel ends so enabling delivery does not replay historical messages.
- Added channel-name validation and typed message discriminants at channel boundaries to make routing and inspection stricter.
- Added surface activity and user reachability plumbing, including `shrimpy users presence`, so surfaces can report where users were last active.

### Sessions, Models & TUI

- Added a shared session planner for direct, TUI, and gateway turns so model resolution, tool policy, turn context, and active publication channels are planned consistently.
- Added gateway session stop control and hardened dispatch so running channel turns can be interrupted and reported more predictably.
- Added session record and compaction inspection plumbing for richer session listing, resume, and maintenance behavior.

### Docs & Agent References

- Added an explicit changelog threshold to the `shrimpy-dev-changelog` skill: include changes when a user, operator, maintainer, or agent would act differently because of them.
- Updated source skill architecture guidance and reference docs for skills, channels, sessions, memory, security, workspace storage, and setup behavior.

## 🦐 0.3.0 - A Window in the Reef - 2026-06-06

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
- Added a command catalog, `shrimpy help all`, group help, nested command help, and unknown-topic errors so the CLI surface is inspectable without loading workspace config.
- Added `shrimpy completion bash|zsh|install|write-state|status` for generated shell completion and completion-state inspection.

### Workspace & Setup

- Added shared and per-agent `vault/` and `projects/` workspace defaults plus setup-template guidance for saved files, reports, and project work folders.
- Changed `shrimpy setup` to set up missing model policy and context while leaving configured workspaces unchanged.
- Changed first-run onboarding to launch the default `shrimpy` agent with the `setup` skill through the required `coding` model policy, preserving other agent policies without letting them block setup.
- Added a mechanic agent setup flow with seeded setup, add-agent, channel-routing, mechanic, and watches skills for CLI-first workspace configuration.
- Changed fresh setup to seed focused `memory-management`, `journal-daily`, and `journal-compact` watches on the `maintenance` channel instead of a broad catch-all upkeep entry.

### Agents, Skills & Tools

- Added Pi-backed workspace and agent skill management, including `shrimpy skills list`, `show`, `add`, `install`, and `validate`.
- Changed session startup to pass Shrimpy-selected skill entrypoints to Pi while keeping Pi's ambient skill discovery disabled.
- Added skill inspection and validation for agent-over-workspace shadowing, Pi loader diagnostics, id/name mismatches, unsafe layouts, and large visible skill sets.
- Added built-in source skills for coding delegation, reference-doc maintenance, changelog writing, Pi upgrade assessment, and release preparation.

### Turn Context

- Added `shrimpy context turn` plus `context.turn` settings for max size, unread channel context, and session recency status.
- Changed direct, TUI, gateway, and child-session turns to prefix live `<context>` envelopes onto the persisted user message, so session JSONL matches the model-facing input.
- Unified command-source execution for turn context previews and runtime turns, including inspectable items, error reporting, freshness state, and `--session-type` support for `shrimpy context sources run`.

### Channels & Agent Policy

- Added richer channel inspection with `shrimpy channels show` message counts, request-like message summaries, traceable source records, and `shrimpy channels search` filters.
- Changed channel wake behavior from channel-owned attention to agent-owned `channelPolicy`, including base and per-channel modes, sender/actor/user filters, membership checks, and inspectable wake/ignore explanations.
- Scoped active publication helpers to gateway/channel sessions and clarified direct-session delivery, explicit `send_message` routing, and internal agent DM delivery.

### Watches & Gateway

- Added `shrimpy watches list|show|add|history|run` for inspecting, creating, and manually running watches, including target channels, expected channel-policy wake decisions, clock state, active runs, run history, diagnostics, and inspect commands.
- Added time-based message watches for the simple wake-an-agent case and command watches with `emit.policy` for observation-driven channel output.
- Added TUI `/status watches`, gateway/status watch summaries, watch-origin channel provenance, and turn-context breadcrumbs back to watch inspection commands.
- Removed legacy scheduler modules, schedule commands, one-time schedule/reminder state, scheduler/reminder channel provenance, and old heartbeat-specific compaction/status handling.

### Sessions, Models & TUI

- Added visible session messages when a session model changes, including previous/current model refs, thinking level, and resolved inference metadata.
- Improved session metadata recording after model switches so resumed sessions and inspection output reflect the active model.
- Added contained system prompt rendering so Pi skill inventory and runtime facts are represented as Shrimpy prompt sections with an explicit context boundary.
- Changed TUI `/new` handling to archive the previous TUI session file after Pi opens a fresh session, keeping session listing and restore behavior consistent.
- Fixed TUI startup so the configured Shrimpy theme is registered before Pi builds interactive components.
- Restored Shrimpy TUI turn-context display so persisted context envelopes are hidden by default and shown when `ctrl+o` expands tool output.

### Docs & Agent References

- Added channel, session, security, turn-context, workspace storage, skills, and tool-model reference documentation.
- Added Pi skill-handling, web search provider, BlueBubbles adapter, in-OS sandboxing, and Bash automation research notes that inform agent and operator workflows.
- Added Shrimpy emoji guidance to the default initialized `SOUL.md` template.

### Release & Dependencies

- Updated production transitive `protobufjs`, `@protobufjs/utf8`, and `ws` lockfile entries to resolve npm audit advisories.

## 🦐 0.2.0 - Lanterns in the Current - 2026-05-30

### TUI

- Added a Shrimpy-owned TUI layer on top of Pi interactive mode, including unified `/status` and `/settings` surfaces, model/thinking selectors, compact tool rows with Ctrl+O expansion, and the bottom-row Shrimpy activity indicator.

### Sessions, Models & TUI

- Added `shrimpy models` and `shrimpy models resolve` for inspecting agent defaults, Pi-visible provider models, session/channel model precedence, and missing default-model setup hints.
- Changed model defaults to require explicit provider/id pairs, restore saved model selections for local `tui` and `run` sessions, and record current model/inference metadata in session history.
- Improved compaction summaries with session-agent context, looser summary formats, system-prompt-aware chunking, and stronger preservation of agent voice/workspace expectations.
- Improved model-variant inference handling so payload rewrites and sampler params apply only to the current model.

### Channels & Agent Policy

- Added `shrimpy agent inspect`, `--disable-tools`, and tool capability policy reporting so agents can enable Shrimpy daemon tools while excluding Pi built-ins or other registered tools.
- Added active-channel publication tools: `reply`, `ask`, `notify`, and `report`. Publication intent now flows through channel egress, and Telegram low-urgency notifications can be delivered quietly.
- Added fine-grained `shrimpy agent attention set` and `shrimpy agent attention clear` mutators for base and per-channel attention policies.
- Changed gateway/status reporting to summarize generic scheduled runs across configured schedules instead of treating heartbeat as a runtime/status primitive.

### Docs & Agent References

- Added memory reference documentation, Discord DM adapter research, release-process docs, and backlog notes for browser automation, worker sessions, durable waits, vault conventions, setup/security, and surface work.

### Release & Dependencies

- Added release metadata from `package.json` so CLI help/version output follows the configured package version, description, and release name.
- Changed Pi integration to depend on registry-published `@earendil-works/*@0.77.0` packages, with the local patch/fork path documented as a private-only contingency.

## 🦐 0.1.0 - First Light in the Tidepool - 2026-05-30

### Release & Dependencies

- Initial alpha release of Shrimpy.
- APIs, CLI behavior, and workspace layout may change.
