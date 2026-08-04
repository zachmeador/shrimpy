# 🦐 Shrimpy Changelog

Public releases at `0.1.0` or later get a short lyrical aquatic release name/tagline.

## 🦐 0.6.2 - The Blue Hour - Unreleased

### Breaking Changes

- Changed Telegram group-chat commands to require the sender's numeric Telegram user ID in `telegram.instances.<id>.users`; allowed one-to-one private chats authorize their matching Telegram user directly.
- Removed Telegram `/restore`; use local CLI or TUI session recovery instead.

### Channels & Surfaces

- Added shared, adapter-neutral `/help`, `/status`, `/new`, `/clear`, `/stop`, and `/thinking <level>` semantics with exact argument validation, fail-closed authorization, permission-filtered help, observational lane status, and command-shaped input that never wakes an agent.

## 🦐 0.6.1 - The Blue Hour - 2026-07-29

### Web Inspector

- Added a stable two-row inspector header with readable session scope, loaded-range session and channel summaries, node-specific fold/follow controls, and one live-status indicator.
- Added a denser tree with relative modification times, meaningful session markers, keyboard filtering and four-arrow navigation, persisted expansion controls, and a hideable narrow-screen sidebar.
- Added first-class workspace and per-agent Context and Skills tree groups, including agent `SOUL.md`, complete skill package contents, and workspace-contained scoped reads.
- Added compact wrapping watch tables with next-run and enablement state, rendered Markdown with a raw view, color-coded JSON, more useful agent summaries, clearer role, date, path, and prose treatment in transcripts, and coral accents matching Shrimpy's TUI.
- Improved session and channel reading by folding generated context, system/tool metadata, custom records, channel state, and unknown payloads behind persisted noise and tool-I/O controls; tool results no longer render twice.

### Channels & Agent Policy

- Added a bounded channel reply watchdog for human-authored turns: when an agent finishes without writing back to the channel, a context-free quick model call can leave the turn alone or wake the same persistent session once with a visible recovery prompt; gateway lane status reports reviewed, woke, and failed outcomes.
- Changed two-agent DMs to address each member's messages to the other member automatically, so `send_message` wakes agents using `addressed` policy without mentions, policy edits, or CLI injection; non-member agents cannot publish into the DM.

### Turn Context

- Changed workspace knowledge search and automatic breadcrumbs to respect `agents[].knowledgeScope`: ordinary agents rank shared and agent-owned knowledge, explicitly global agents rank every agent corpus, and mechanic always has global knowledge visibility.
- Added `--agent` and `--all-agents` selectors to `shrimpy workspace search`, with effective agent and knowledge scope included in search output.

### Sessions, Models & TUI

- Upgraded all Pi packages from `0.82.1` to `0.83.0` and aligned Pi-facing TypeBox schemas on `1.3.7`, adding safer active-response session replacement, preserved provider stop reasons, earlier OAuth refresh, headless OpenRouter login, Claude Opus 5 through GitHub Copilot, and upstream resource, model-selector, and terminal-image fixes.

### Docs & Agent References

- Added the `shrimpy-dev-web` developer skill for building, debugging, testing, and reviewing the separate web inspector and its gateway-managed sidecar.

## 🦐 0.6.0 - The Blue Hour - 2026-07-26

### Breaking Changes

- Removed the Telegram `/agent` command. Chat users can no longer inspect or switch addressed-agent routing from inside Telegram; operators retain `defaultAgentId` configuration and `shrimpy surface set-agent|clear-agent`.
- Replaced executable objects in `context.sources` with automatic commands under `context.turn.producers`, using `run`, `when.channels`, and `cacheMs`; stable base, agent, and channel source lists now accept resource strings only, and channel-scoped producers no longer match channel-less sessions.
- Removed the `on` thinking alias. Thinking inputs now accept only Pi's canonical levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.
- Added workspace runtime profiles with global `--workspace`, `SHRIMPY_WORKSPACE`, cwd-local `.shrimpy` discovery, workspace-local `runtime/bin` command shims, and profile-bound gateway services so development and normal environments can coexist without PATH or pointer collisions.
- Changed gateway service identities from one global user service to workspace/app-bound names. Existing `shrimpy-gateway.service` or `io.github.zachmeador.shrimpy.gateway.plist` files are not removed automatically; reinstall the gateway for the workspace you want to run.
- Removed the nested `~/.shrimpy/.shrimpy-workspace.json` pointer location. Use explicit `--workspace`, `SHRIMPY_WORKSPACE`, cwd-local `.shrimpy`, `~/.shrimpy-workspace.json`, or the default `~/.shrimpy/`.
- Removed Shrimpy-owned local model variant fields and request rewriting for OpenAI-compatible providers. `baseModel`, `inference`, `--base-model`, `--enable-thinking`, `--disable-thinking`, and `--qwen-chat-template` are no longer Shrimpy configuration surfaces.
- Changed local model setup to write Pi-native provider/model entries only. Use Pi's `state/pi/models.json` fields, including Pi-native `compat.thinkingFormat` values such as `qwen` or `qwen-chat-template`, when a local provider needs compatibility settings.
- Changed direct and gateway session cwd defaults to use the selected agent's configured `cwd` instead of the shell launch directory or workspace fallback. Use `agents[].cwd` or `shrimpy agent set <id> --cwd <path>` to pin custom workspaces.
- Replaced flat sanitized session directories with canonical ids (`local/<name>`, `channel/<name>`, and `worker/<name>`). Each durable session now has a reversible directory path and a `session.json` identity file, and Shrimpy prevents multiple processes from writing the same transcript at once. Existing flat session directories are not read or migrated.
- Changed `shrimpy sessions` lifecycle, thinking, stop, list, and compaction arguments to require canonical session ids instead of ambiguous labels or channel names.
- Changed `shrimpy run` to use an in-memory session by default. Pass `--session <session-id>` to resume durable state explicitly.
- Removed the top-level `shrimpy mechanic` command. Use `shrimpy chat mechanic` to open the mechanic agent through the normal chat path.

### Installation & Update

- Changed `shrimpy update` into a mechanic-led tagged-release workflow: it opens normal mechanic chat with the app-bundled migration skill and exact release context, uses a guarded exact-tag apply primitive, and restores the previous app if the new mechanic TUI cannot bootstrap.
- Changed managed installs to record their origin, requested ref, and installed commit outside the replaceable app directory, and expanded setup and migration guidance to carry approved routine work through gateway lifecycle and end-to-end verification without repeated confirmation.

### Watches & Gateway

- Added a default-on, gateway-managed loopback web inspector sidecar with `web.enabled`/`web.port` config, restart supervision, clean shutdown, and status/heartbeat reporting that remains non-fatal to gateway work.
- Fixed one agent's invalid `watches.json` stopping the shared watch clock or blocking other agents' reloads; failed reloads keep that agent's last valid watches, and `shrimpy watches` reports sanitized per-agent load failures.
- Changed gateway ownership and status to use an atomic workspace PID claim, cross-platform process identity, and a fresh heartbeat record; service-manager state is reported separately and manual gateways remain visible as running with a management warning.
- Added Telegram surface health reporting for successful polling, retries, stalls, recovery, and bounded failure details.

### Turn Context

- Added always-on workspace knowledge breadcrumbs with bounded high-confidence path pointers, automatic local index maintenance, and workspace-wide `context.turn.knowledge` ranking controls.
- Changed direct and TUI model context plus `shrimpy context` previews to place turn context before the user prompt while preserving the unchanged prompt and collapsed context attachment in direct transcripts.

### Sessions, Models & TUI

- Changed `shrimpy context` to show the same context a real turn sends to the model; `--session <canonical-id>` includes existing session history without changing its transcript.
- Added `shrimpy context producers list|run` plus per-turn producer status reporting so matching, cached output, failures, and skips are inspectable without conflating live commands with stable context sources.
- Added `/agents`, a searchable Pi-style agent/session hierarchy with four-arrow traversal, new `local/main` chats for zero-session agents, live cross-agent runtime switching, current-agent identity on the existing startup-header line, preflight and rollback safety, plus `shrimpy sessions list --all-agents` for the same inspectable inventory.
- Changed bare `shrimpy` to resume the agent used most recently in terminal chat while prompted and explicit-agent launches keep their existing targets; `/new` preserves the selected agent even before the fresh conversation receives a reply.
- Reduced the Pi-private TUI surface while retaining Shrimpy UX: public Pi APIs now own `/new` lifecycle, thinking state, working-indicator state, footer composition, retry/compaction events, custom-message registration, and tool expansion; five named compatibility seams preserve inline status/help and the Shrimpy `/changelog`, the unified `/settings` landing page and live Shrimpy readouts, model favorites and command guardrails, terminal-title identity, and zero-row collapsed turn context.
- Changed direct-session turn context to persist as a model-visible custom message after the unchanged user message. It stays collapsed in the transcript by default, reappears with Ctrl+O for turn inspection, and keeps session previews clean.
- Replaced separate direct/gateway planning and duplicate delivery queues with one `SessionResolver`, foreground host, and gateway `SessionPool`; every durable session now shares saved-model restoration, manifest discovery, and owner-aware controls.
- Changed `shrimpy sessions new|clear|restore|thinking|stop` to route through the session's live owner, verify correlated gateway outcomes, apply unowned lifecycle changes under an exclusive maintenance lease, and expose `--no-wait` plus structured JSON outcomes. Stop controls now bypass a running turn instead of waiting behind the delivery queue.
- Upgraded Pi packages from `0.79.6` to `0.80.6`, adding the `max` thinking level, automatic light/dark TUI themes, cache-miss notices, output padding, and the latest provider, model, auth, compaction, and rendering fixes.
- Upgraded all Pi packages from `0.80.6` to `0.82.1` and migrated Shrimpy to Pi's canonical `ModelRuntime`, including provider-owned setup login and refresh, offline dynamic catalog persistence, runtime-routed compaction auth, bounded summary retries, isolated summary routing/cache policy, and aggregate compaction usage.

### Channels & Agent Policy

- Added a visible operation-status notice when a gateway channel session's compaction fails terminally, while routine, retryable, aborted, and direct-session compaction stays quiet.
- Added Telegram notice headers for messages delivered by a non-default agent and operation statuses, while keeping stored channel records unchanged; setup, channel, and watch guidance prefers dedicated bot identities for agents with an ongoing chat presence and the user's primary chat for occasional support-agent reports.
- Changed gateway turn guidance so publication tools carry user-visible replies, plain assistant text stays private, and agents do not duplicate a message after publishing.

### Fixed

- Rebuilt the read-only web inspector around current workspace files with a dense tree menu, synthetic channel/agent/session/runtime nodes, decoded session identities, bounded incremental transcript tails, instant filesystem updates, realpath containment, and explicit secret denial.
- Fixed Shrimpy TUI terminal tabs retaining Pi's `π` identity; titles now show `🦐 - Agent: <agent> - cwd: <cwd>` across Pi title refreshes and `/agents` switches.
- Fixed TUI `/new` exiting instead of starting a fresh session when durable session ownership was enabled.
- Fixed TUI parity regressions that removed model favorites, flattened `/settings`, replaced inline operational output with modal panels, showed unsupported thinking choices, stopped the footer shrimp during retry or compaction, and left blank rows for collapsed turn context.
- Fixed concurrent worker state mutations overwriting other worker records, duplicate worker ids being accepted, and late supervisor results reviving cancelled or closed turns.
- Fixed session ownership races during stale-owner replacement, cleanup, and token-checked release.
- Fixed watch schedule edits retaining stale next-run timestamps by binding persisted clock entries to their effective interval or cron/timezone schedule.

### Release & Dependencies

- Updated the production transitive `linkify-it` lockfile entry to resolve a denial-of-service advisory.

## 🦐 0.5.0 - The Reef Remembers - 2026-06-17

### Breaking Changes

- Removed `shrimpy setup init`; use `shrimpy setup` for first-run workspace setup and repair.
- Removed `shrimpy skills bind` and `shrimpy skills unbind`. Skill package visibility now comes from installed workspace or agent `skills/` files, and `shrimpy skills remove <id> [--agent <id>|--workspace]` deletes one managed copy.
- Included skills are no longer hidden app defaults. They install as normal files under workspace or agent `skills/` directories. Existing workspaces that used the old built-in copies should install their own with `shrimpy skills add included:<id> --workspace` or `--agent <id>`.
- Shrimpy how-to skills now use explicit `shrimpy-*` names, such as `shrimpy-setup`, `shrimpy-agents`, `shrimpy-channels`, `shrimpy-watches`, and `shrimpy-skills`. Update saved `--skill` commands that used the old names.
- Renamed the `vault-capture` skill package to `remember`. Update saved `--skill vault-capture` and `included:vault-capture` references.

### Installation & Update

- Added `shrimpy update [--dry-run] [--json]` to inspect the install checkout, protected workspace paths, gateway service state, mechanic model readiness, and migration handoff before a future update apply path.
- Improved the curl installer so reruns handle installer-created `package-lock.json` files and new shells get a direct `~/.local/bin/shrimpy setup` next step.

### Workspace & Setup

- Fresh setup now writes the default skills into the workspace and mechanic agent, so users and agents can inspect and edit the actual skill files.
- New workspaces get visible copies of the coding delegation, memory, journal, `remember`, Shrimpy how-to, search, and mechanic audit skills.
- Changed fresh setup to seed memory, journal, security-audit, and hygiene-audit watches disabled by default, with `shrimpy watches enable|disable <agent-id>/<watch-id>` available for explicit activation.
- Added interactive model setup and `shrimpy models providers add-openai-compatible` for local or OpenAI-compatible endpoints, including context-window, max-tokens, Qwen thinking-template, and `--set-coding` support.
- `codex-web-search` is still available as `included:codex-web-search`, but setup no longer installs it by default.

### Agents, Skills & Tools

- Changed `shrimpy skills add` so included, local, URL, and GitHub skills all copy into the selected workspace or agent and track when those files are edited. The old `--id` flag is gone; package ids now come from the skill's own `name`.
- Added `shrimpy skills remove <id> [--agent <id>|--workspace]` to uninstall one skill from a workspace or agent.
- Changed `shrimpy skills update` to accept `--agent` or `--workspace` when multiple installs share a skill id.
- Changed `shrimpy skills list` and `shrimpy skills validate --json` to show each managed skill's source, install location, and local edit status.
- Changed `shrimpy mechanic` to stop loading the removed generic `mechanic` skill. Pick focused skills explicitly when a maintenance session needs them.

### Channels & Agent Policy

- Changed bound surface delivery so message-watch instruction text and arbitrary system text stay in channel logs; agent replies, command-watch emissions, media, and operation-status acknowledgements still deliver outward.

### Watches & Gateway

- Added `shrimpy watches enable <agent-id>/<watch-id>` and `shrimpy watches disable <agent-id>/<watch-id>` to toggle existing watches without editing JSON by hand.
- Changed gateway watch startup to leave missing `agents/<id>/watches.json` files alone; setup and watch commands now own watch file creation.

### Sessions, Models & TUI

- Upgraded Pi packages from `0.77.0` to `0.79.6` and surfaced Pi's `defaultProjectTrust` setting in Shrimpy's unified TUI settings.
- Improved TUI session previews so unnamed session resume rows hide persisted turn-context envelopes.
- Added a compact TUI renderer for model-switch messages and expanded Bash tool rows so full commands are visible only when expanded.
- Improved `shrimpy models resolve --session` so saved session model restoration is reported through the same resolver used by TUI and run sessions.

### Docs & Agent References

- Added `remember` for storing things worth keeping in the vault: collections, inbox captures, research packets, source notes, worker handoffs, and versioned files.
- Added `shrimpy-search` so agents can check workspace notes, sessions, channels, and current turn context before answering from memory.
- Added `shrimpy-skills` for writing, installing, validating, and maintaining workspace and agent skills.
- Added `shrimpy-dev-skills` for maintaining Shrimpy included skills, repository developer skills, and generated skill mirrors.
- Improved `shrimpy-workspace-migration` so it preserves custom skills and asks before overwriting edited `shrimpy-*` skill copies.
- Removed the broad `shrimpy-workflows` skill. Workflow guidance now lives in focused skills such as `shrimpy-search`, `shrimpy-watches`, `shrimpy-channels`, `remember`, and `shrimpy-coding-delegation`.

## 🦐 0.4.1 - Tides Pull Both Ways - 2026-06-13

### Breaking Changes

- Changed Telegram gateway instances without `allowedChatIds` to fail config validation; run `shrimpy setup telegram` to add allowed chat IDs before restarting the gateway.

### CLI & Plumbing

- Added `shrimpy sessions search|read` and `shrimpy workspace search|index` for bounded local transcript and workspace-knowledge recall.
- Added `--full` to `shrimpy channels read` and `shrimpy channels search`, with bounded plain output by default and complete JSON reads preserved for pipes.
- Changed `shrimpy channels --json` to use the concise channel summary shape while keeping detailed activity on `shrimpy channels show`.
- Added `shrimpy worker backends` to inspect and refresh persisted Codex, Claude Code, and Pi worker backend availability.
- Added `shrimpy worker start|list|status|read|tail|send|wait|cancel|close` for detached, file-backed worker records, with Codex `exec --json` and Shrimpy/Pi direct-session backend paths. Claude Code is recorded as deferred.
- Added top-level `latestTurn`, `artifactPaths`, and `commands` shortcuts to single-worker JSON output.
- Improved worker summaries with goal, status, key actions, files touched, blockers, and latest result sections.

### Channels & Surfaces

- Changed Telegram inbound handling to drop unauthorized updates before channel binding, identity mapping, presence, commands, media downloads, or model wake.
- Changed channel outbox delivery to keep control, system, and informational status records out of Telegram and other bound surfaces while still delivering operation-status acknowledgements.

### Turn Context

- Added compact agent-owned watch inventory to normal turn context and `shrimpy context turn`, sourced from the same inspection model as `shrimpy watches --agent <id>`.
- Added owned worker outcome context with current-session/current-channel relevance tiers and compact counts for other completed, blocked, failed, or cancelled workers.
- Added worker outcome counts to generated session status so agents notice completed, blocked, failed, and cancelled workers during background wake turns.

### Workspace & Setup

- Changed `shrimpy setup telegram` to require at least one allowed chat ID and poll Telegram directly for discovery instead of asking users to start an open gateway first.
- Improved gateway service installs and startup PATH handling so watch actions and gateway sessions can resolve `shrimpy` from `~/.local/bin`.
- Added `state/worker-backends.json` during setup so worker backend availability is recorded without making external CLIs required.
- Added `state/workers.json` and `runtime/workers/` for inspectable coding worker records and captured worker artifacts.
- Added per-turn worker `--timeout-ms` handling so long-running starts or amendments can be cancelled automatically.
- Changed worker cancel, close, and stale reconciliation to terminate recorded process groups and escalate to `SIGKILL` when they do not exit after a grace period.
- Added `coding-delegation` as an all-agent source-default skill gated on Bash, while keeping workspace-local overrides available under `skills/`.
- Added mechanic-only `security-audit` and `hygiene-audit` source-default skills for read-only workspace audit reports under the mechanic vault.
- Removed the unused `run_child` daemon tool surface.

### Docs & Agent References

- Added the `shrimpy-dev-git-commit-all` source skill for light-touch grouping and committing of mixed local worktree changes.
- Added the `shrimpy-dev-live-workspace` source skill for read-only production workspace pattern audits that feed source defaults, skills, docs, or backlog updates.
- Added the `shrimpy-dev-backlog-worktree-session` source skill for isolated backlog implementation branches, parallelism triage, user-approved merge handoff, and worktree cleanup.

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
