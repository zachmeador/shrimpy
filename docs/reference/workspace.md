# 🦐 Workspace

The workspace is Shrimpy's persistent home directory. By default it is `~/.shrimpy/`; the path can be overridden with `~/.shrimpy-workspace.json`.

## Layout

```text
profile/WORKSPACE.md            shared workspace/home instructions
profile/SYSTEM.md               workspace-level Shrimpy framework map and breadcrumbs
profile/USER.md                 workspace owner identity and preferences
config/shrimpy.json             main runtime config
config/channels.json            channel membership
vault/                          shared saved files and collections
projects/                       shared code, apps, and experiment work
agents/                         per-agent workspaces
state/pi/auth.json              provider credentials
state/pi/models.json            model registry
state/users.json                identity links (transport→userId) + workspace owner
state/watch-clock.json            persisted watch next-run timestamps
state/telegram/                 Telegram polling offsets
runtime/cursors/channels.json   gateway channel cursors
runtime/cursors/surface-threads.json addressed-agent state for surface threads
runtime/context/                generated turn-context state
runtime/watches/                watch active-run state and run history
channels/                       append-only channel logs
media/                          downloaded media
runtime/logs/gateway.log        gateway runtime log
skills/                         workspace-level shared skills
docs/framework/                 framework reference material
```

Each agent workspace under `agents/<id>/` contains:

```text
SOUL.md                         identity and voice
context/                        agent memory and prompt files
vault/                          agent saved files and reports
projects/                       agent code, apps, and work folders, created when needed
watches.json                    agent-owned background attention rules
skills/                         agent-level skill bundles
sessions/                       Pi session persistence
```

Workspace skills live under `skills/<id>/SKILL.md`; agent skills live under `agents/<id>/skills/<id>/SKILL.md` and override workspace skills with the same id. Fresh setup keeps mechanic-only skills under `agents/mechanic/skills/` so the normal `shrimpy` agent does not inherit maintenance guidance by default. See [skills.md](skills.md) for bundle shape, Pi loading behavior, and CLI management.

## Storage

Use `vault/` for saved files and collections. Use `projects/` for code, apps, experiments, or a focused work folder. These are normal directories.

Inside an agent root:

- `agents/<id>/context/` is memory and prompt files.
- `agents/<id>/vault/` is saved files and reports for that agent.
- `agents/<id>/projects/` is code, apps, or work folders for that agent. Create it when needed.

Reports should go under `agents/<id>/vault/<kind>/`, for example `agents/security/vault/audits/` or `agents/mechanic/vault/assessments/`. Do not put reports in `context/`. Put a reference in `context/` only if the agent should load it every run.

Do not put channel logs, runtime state, sessions, auth, model metadata, or watch clock state under `vault/` or `projects/`.

Setup onboarding creates shared `vault/` and `projects/`, plus the default agents' `agents/shrimpy/context/`, `agents/shrimpy/vault/`, `agents/mechanic/context/`, and `agents/mechanic/vault/`. Per-agent `projects/` directories are created when needed.

## Checkpoints

Workspace git checkpoint tracking is opt-in. `shrimpy workspace track init` initializes a local git repo at the workspace root, writes a strict whitelist `.gitignore`, and creates an initial checkpoint commit. It does not configure a remote. If the workspace already has a git repo without the Shrimpy checkpoint whitelist, init refuses to adopt it.

The default whitelist tracks `.gitignore`, `profile/WORKSPACE.md`, `profile/SYSTEM.md`, `profile/USER.md`, `config/shrimpy.json`, `config/channels.json`, `agents/*/SOUL.md`, `agents/*/watches.json`, `agents/*/skills/**`, and `skills/**`. It ignores runtime state, channel logs, sessions, auth, model metadata, media, `vault/`, and `projects/`.

Use `shrimpy workspace track status --json` to inspect whether tracking is disabled, clean, dirty, or misconfigured. Use `shrimpy workspace track checkpoint --message <text>` to create a manual checkpoint. When the gateway is running and tracking is enabled, Shrimpy checks about every 15 minutes and creates an automatic checkpoint commit only when checkpointable files changed.

## Context Resources

Stable prompt material loaded into an agent session before per-turn context arrives:

- `profile/WORKSPACE.md` defines shared system/home context.
- `profile/SYSTEM.md` covers editable workspace-level Shrimpy framework context and inspection breadcrumbs. It does not contain the compact immutable instructions prepended during session setup.
- `profile/USER.md` declares workspace-owner identity (name, surface handles, hard preferences).
- `SOUL.md` defines who an agent is.
- `context/*.md` is the agent's long-lived prompt context: identity notes, habits, active references, and other memory the agent should load.
- `context/people/<actor-id>.md` and `context/channels/<name>.md` are loaded only for matching turns.

Setup onboarding creates baseline files from `src/setup/templates/`.

Durable machine state lives under `state/`. Disposable runtime state lives under `runtime/` and surfaces at turn time through the context envelope.

## State And Logs

- Channel logs are append-only JSONL files under `channels/`. See [channels.md](channels.md).
- Agent memory is plain Markdown under `agents/<id>/context/`; agents update it through normal file edits during upkeep watch turns. See [memory.md](memory.md).
- Identity links live in `state/users.json`. The optional `owner` field names the canonical workspace user; CLI publishing routes through that identity when set. Manage with `shrimpy users list|get-owner|set-owner`.
- Session transcripts live under each agent's `sessions/` directory. Each channel/session label has one directory containing its Pi `.jsonl` files. Reset and restore state is tracked inside those JSONL files with Shrimpy custom entries. See [sessions.md](sessions.md).
- Gateway logs live at `runtime/logs/gateway.log`, readable through `shrimpy gateway logs`.
- Surface cursors, generated turn-context state, and watch run history live under `runtime/`. Watch next-run state lives under `state/watch-clock.json`.
- Auth and models live under `state/pi/`, isolating Shrimpy from a user's stock Pi config.
