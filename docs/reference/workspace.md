# 🦐 Workspace

The workspace is Shrimpy's persistent home directory. By default it is `~/.shrimpy/`; the path can be overridden with `~/.shrimpy/.shrimpy-workspace.json`. Shrimpy also checks `~/.shrimpy-workspace.json` as a fallback.

## Layout

```text
profile/WORKSPACE.md            shared workspace/home instructions
profile/SYSTEM.md               workspace-level Shrimpy framework map and CLI breadcrumbs
profile/USER.md                 workspace owner identity and preferences
config/shrimpy.json             main runtime config
config/channels.json            channel membership
agents/                         per-agent workspaces
state/pi/auth.json              provider credentials
state/pi/models.json            model registry
state/worker-backends.json      persisted worker backend availability
state/workers.json              coding worker session records
state/users.json                identity links (transport→userId) + workspace owner
state/user-presence.json        last active surface channel per known user
state/watch-clock.json            persisted watch next-run timestamps
state/telegram/                 Telegram polling offsets
runtime/cursors/channels.json   gateway channel cursors
runtime/cursors/surface-threads.json addressed-agent state for surface threads
runtime/context/                generated turn-context state
runtime/search/                 rebuildable workspace search cache
runtime/watches/                watch active-run state and run history
runtime/workers/                worker JSONL, stderr, and last-message artifacts
channels/                       append-only channel logs
media/                          downloaded media
runtime/logs/gateway.log        gateway runtime log
skills/                         workspace-level shared skills
```

Each agent workspace under `agents/<id>/` can contain:

```text
SOUL.md                         identity and voice
context/                        optional agent memory and prompt files
vault/                          agent saved files and reports
projects/                       agent code, apps, and work folders
watches.json                    agent-owned background attention rules
skills/                         agent-level skill bundles
sessions/                       Pi session persistence
```

Workspace-authored skills live under `skills/<id>/SKILL.md`; agent-authored skills live under `agents/<id>/skills/<id>/SKILL.md` and override workspace skills, package bindings, and source defaults with the same id. Fresh setup uses source default skills instead of copying unchanged default bundles into the workspace. See [skills.md](skills.md) for bundle shape, Pi loading behavior, and CLI management.

## Storage

Use per-agent storage for saved files and project work. These are normal directories.

Inside an agent root:

- `agents/<id>/context/` is memory and prompt files.
- `agents/<id>/vault/` is saved files and reports for that agent.
- `agents/<id>/projects/` is code, apps, or work folders for that agent.

Reports should go under `agents/<id>/vault/<kind>/`, for example `agents/security/vault/audits/` or `agents/mechanic/vault/assessments/`. Do not put reports in `context/`. Put a reference in `context/` only if the agent should load it every run.

Vault collections are loose, user-led folders under the owning agent's `vault/`. Typical collections include recipes, household notes, travel ideas, research links, and purchase comparisons. Agents can create an obvious folder when the request is clear, such as `agents/<id>/vault/recipes/<slug>.md` for an adapted recipe that keeps the source URL, but should ask before introducing a broad taxonomy. The source-default `vault-capture` skill carries the operational workflow for capture, catalog, research packets, worker handoffs, and versioning.

The default `shrimpy` agent uses predictable intake paths for general capture work:

- `agents/shrimpy/vault/inbox/` for quick captures that need later sorting.
- `agents/shrimpy/vault/research/<YYYY-MM-DD>-<slug>/` for bounded research packets.
- `agents/shrimpy/vault/catalog.md` or per-collection indexes only when an index helps later retrieval.

A captured item should preserve source URL or origin, capture timestamp, the user's request, saved files, and obvious tags or categories when practical. A research packet can contain `brief.md` for the request and current state, `sources.md` for links and retrieval notes, `notes.md` for findings and uncertainties, and optional artifacts under a clearly named subfolder. Worker sessions can use the packet path as handoff material for bounded research or implementation work.

Agents should report saved vault paths and unresolved questions back to the user. Vault versioning is explicit: default workspace checkpoint tracking leaves `vault/` and `projects/` outside the whitelist, so kept vault material should be committed only when the user asks, using a user-chosen repo or explicit checkpoint setup for selected keeper files.

Do not put channel logs, runtime state, sessions, auth, model metadata, or watch clock state under agent `vault/` or `projects/`.

Setup onboarding creates the default agents' `vault/` and `projects/` directories under `agents/shrimpy/` and `agents/mechanic/`. It creates agent `context/` files only when there is real default context, such as the mechanic's `context/scope.md`. `shrimpy agent add` scaffolds per-agent `vault/` and `projects/` directories; `context/` can be added when the agent has durable memory worth loading.

## Checkpoints

Workspace git checkpoint tracking is opt-in. `shrimpy workspace track init` initializes a local git repo at the workspace root, writes a strict whitelist `.gitignore`, and creates an initial checkpoint commit. It does not configure a remote. If the workspace already has a git repo without the Shrimpy checkpoint whitelist, init refuses to adopt it.

The default whitelist tracks `.gitignore`, `profile/WORKSPACE.md`, `profile/SYSTEM.md`, `profile/USER.md`, `config/shrimpy.json`, `config/channels.json`, `agents/*/SOUL.md`, `agents/*/watches.json`, `agents/*/skills/**`, and `skills/**`. It ignores runtime state, channel logs, sessions, auth, model metadata, media, and agent `vault/` and `projects/` directories.

Use `shrimpy workspace track status --json` to inspect whether tracking is disabled, clean, dirty, or misconfigured. Use `shrimpy workspace track checkpoint --message <text>` to create a manual checkpoint. When the gateway is running and tracking is enabled, Shrimpy checks about every 15 minutes and creates an automatic checkpoint commit only when checkpointable files changed.

## Search

`shrimpy workspace search <query> [--limit N] [--json]` searches the written workspace knowledge corpus: `profile/*.md`, workspace skills, agent skills, `agents/<id>/context/`, and `agents/<id>/vault/`. Results are workspace-relative paths with heading trails, line numbers, scores, clipped snippets, last-modified time, and content-change time.

Workspace search chunks Markdown by heading section and uses a local keyword scorer. It refreshes a rebuildable cache under `runtime/search/` lazily during search by content hash. `shrimpy workspace index status [--json]` reports corpus size, scorer identity, embedding availability, and stale/unindexed/removed files. `shrimpy workspace index rebuild [--json]` recreates the cache.

The workspace search corpus excludes channel logs and session transcripts. Use `shrimpy channels search` for channel messages and `shrimpy sessions search` for transcript recall.

## Context Resources

Stable prompt material loaded into an agent session before per-turn context arrives:

- `profile/WORKSPACE.md` defines shared system/home context and local path breadcrumbs for the active workspace, Shrimpy app checkout, source directory, docs directory, pattern docs, reference docs, source skill templates, workspace skills, and agent skill stems.
- `profile/SYSTEM.md` covers editable workspace-level Shrimpy framework context and CLI inspection breadcrumbs. It does not contain the compact immutable instructions prepended during session setup.
- `profile/USER.md` declares workspace-owner identity (name, surface handles, hard preferences).
- `SOUL.md` defines who an agent is: role, boundaries, and voice.
- `context/*.md` is the agent's long-lived prompt context: active references and other durable memory the agent should load.
- `context/people/<actor-id>.md` and `context/channels/<name>.md` are loaded only for matching turns.

Setup onboarding creates baseline files from `src/setup/templates/`.

Setup writes absolute breadcrumbs for the active workspace, install-managed Shrimpy app checkout, `src/` directory, `docs/` directory, `docs/patterns/`, `docs/reference/`, source skill templates, workspace skills, and agent skill stems into `profile/WORKSPACE.md`. In the default install, the app checkout is `~/.local/share/shrimpy/app`.

Durable machine state lives under `state/`. Disposable runtime state lives under `runtime/` and surfaces at turn time through the context envelope.

## State And Logs

- Channel logs are append-only JSONL files under `channels/`. See [channels.md](channels.md).
- Agent memory is plain Markdown under `agents/<id>/context/`; agents update it through normal file edits during upkeep watch turns. See [memory.md](memory.md).
- Identity links live in `state/users.json`. The optional `owner` field names the canonical workspace user; CLI publishing routes through that identity when set. Manage with `shrimpy users list|get-owner|set-owner`.
- User presence lives in `state/user-presence.json` and records each known user's last active chat surface channel. Inspect with `shrimpy users presence`; `send_message(channel="user:<id>", ...)` and `shrimpy channels post user:<id> ...` resolve through it.
- Session transcripts live under each agent's `sessions/` directory. Each channel/session label has one directory containing its Pi `.jsonl` files. Reset and restore state is tracked inside those JSONL files with Shrimpy custom entries. See [sessions.md](sessions.md).
- Workspace search cache files live under `runtime/search/` and are rebuildable.
- Worker backend availability lives in `state/worker-backends.json`. Inspect or refresh it with `shrimpy worker backends`.
- Coding worker records live in `state/workers.json`; detached worker logs and last-message artifacts live under `runtime/workers/`. Running worker records store the supervisor pid so cancel, close, and stale reconciliation can terminate the recorded process group and escalate to `SIGKILL` if it stays alive. Worker turns may store `timeoutMs` when launched with a max runtime. Manage workers through `shrimpy worker start|list|status|read|tail|send|wait|cancel|close`.
- Gateway logs live at `runtime/logs/gateway.log`, readable through `shrimpy gateway logs`.
- Surface cursors, generated turn-context state, and watch run history live under `runtime/`. Watch next-run state lives under `state/watch-clock.json`.
- Auth and models live under `state/pi/`, isolating Shrimpy from a user's stock Pi config.
