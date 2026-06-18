# 🦐 Workspace

The workspace is Shrimpy's persistent home directory. It holds the agents, model-visible context, profile docs, config, channel logs, runtime state, skills, auth, models, media, and saved agent work. By default the workspace is `~/.shrimpy/`; a pointer file can select another path. See [configuration.md](configuration.md) for pointer resolution.

## Layout

```text
profile/WORKSPACE.md               shared workspace/home instructions and path breadcrumbs
profile/SYSTEM.md                  editable workspace-level Shrimpy framework context
profile/USER.md                    workspace owner identity and hard preferences
context/                           workspace-level prompt context
config/shrimpy.json                main runtime config
config/channels.json               channel membership, manifests, and transport bindings
agents/                            per-agent workspaces
skills/                            workspace-level shared skills
channels/                          append-only channel logs
media/                             downloaded inbound surface media, currently Telegram photos/photo groups
state/pi/auth.json                 provider credentials
state/pi/models.json               Pi-visible model registry
state/users.json                   identity links plus optional workspace owner
state/user-presence.json           last active chat surface channel per known user
state/watch-clock.json             persisted watch next-run timestamps
state/worker-backends.json         persisted worker backend availability
state/workers.json                 coding worker records
state/telegram/                    Telegram polling offsets
runtime/cursors/channels.json      gateway channel cursors
runtime/cursors/surface-threads.json addressed-agent state for surface threads
runtime/context/                   generated turn-context state
runtime/search/                    rebuildable workspace search cache
runtime/watches/                   watch active-run state and run history
runtime/workers/                   worker JSONL, stderr, and last-message artifacts
runtime/logs/gateway.log           gateway runtime log
```

`state/` is durable machine state. `runtime/` is rebuildable or disposable process state. Channel logs and sessions are records, not prompt memory. Auth and model metadata stay under `state/pi/` so Shrimpy does not depend on a user's stock Pi config.

## Context Directories

`context/` directories are part of the workspace and agent contract. They are model-visible material, not general storage. Anything loaded from one of these directories goes into agent context for all or some sessions.

- `context/` at the workspace root is shared prompt material. Select it with a config source such as `workspace:context/` or `workspace:context/house.md`; source placement decides whether it applies globally, by channel, by agent, or by agent/channel pair.
- `agents/<id>/context/` is the owning agent's prompt memory. The default source list includes `agent:context/`, so top-level `agents/<id>/context/*.md` files load into normal sessions for that agent.
- `agents/<id>/context/people/<actor-id>.md` and `agents/<id>/context/channels/<name>.md` are turn-scoped slices. They load only for matching sender or channel turns.

These directories are intentionally open-ended. Add files, modify seeded files, and create subtrees when the context needs structure. Directory sources load only top-level Markdown files; subdirectories are skipped unless a source names them explicitly, which keeps `people/`, `channels/`, journal material, and other trees out of the stable prompt by default.

## Agent Roots

Each agent root under `agents/<id>/` has the same basic shape:

```text
SOUL.md                            identity, role, boundaries, and voice
context/                           agent memory and prompt files
vault/                             saved notes, reports, captures, and other kept artifacts
projects/                          code, apps, experiments, and focused work folders
watches.json                       agent-owned background attention rules
skills/                            agent-level skills
sessions/                          Pi session transcripts and lifecycle entries
```

`shrimpy agent add <id>` scaffolds an agent root with identity and working directories. `context/` is part of the expected agent root even when it starts empty. Setup creates default roots for `shrimpy` and `mechanic`; the mechanic gets default context such as `context/scope.md`.

Agent-owned skills under `agents/<id>/skills/<skill-id>/SKILL.md` override workspace skills with the same id. Workspace skills live under `skills/<skill-id>/SKILL.md`. Managed package provenance and drift state live in `state/skills/packages.json`. See [skills.md](skills.md).

## Storage Rules

Use the smallest directory that matches how the file will be used:

- `context/` is prompt memory: facts, preferences, active references, and notes that should go to agents. Use workspace `context/` for shared configured sources and agent `context/` for one agent's memory.
- `vault/` is saved material: reports, captures, research notes, records, and other durable files that should not load by default.
- `projects/` is working material: code, apps, generated tools, experiments, and focused project folders.
- `sessions/` is Pi transcript persistence; do not hand-file user artifacts there.
- `channels/` is shared message history; do not copy it into an agent root.

Do not put channel logs, runtime state, sessions, auth, model metadata, media, or watch clock state under `vault/` or `projects/`. Reports belong in `vault/<kind>/`, for example `agents/mechanic/vault/audits/`. Put only a short reference in `context/` when the agent should load that report every run.

The included `remember` skill owns the capture/save workflow. The workspace doc only defines where saved material belongs.

## Prompt Resources

Baseline workspace prompt material lives under `profile/`:

- `profile/WORKSPACE.md` defines shared home context and local path breadcrumbs for the active workspace, app checkout, source tree, docs, reference docs, source skill templates, workspace skills, and agent skill stems.
- `profile/SYSTEM.md` covers editable workspace-level Shrimpy framework context and CLI inspection breadcrumbs. It does not contain the compact immutable system instructions prepended during session setup.
- `profile/USER.md` declares the workspace owner identity and hard preferences.

Shared workspace memory belongs under root `context/` when it should be available to more than one agent or context view but does not belong in the baseline profile files. Select the relevant files or directories through context sources.

Setup writes these files from `src/setup/templates/` and fills in local paths. In an install-managed checkout, the app checkout is normally `~/.local/share/shrimpy/app`.

Agent prompt resources live in the agent root:

- `SOUL.md` defines who the agent is.
- `context/*.md` is always-loaded agent memory for normal sessions.
- `context/people/<actor-id>.md` loads only for matching sender turns.
- `context/channels/<name>.md` loads only for matching channel turns.

See [memory.md](memory.md), [context-assembly.md](context-assembly.md), and [turn-context.md](turn-context.md).

## Checkpoints

Workspace git checkpoint tracking is opt-in. `shrimpy workspace track init` initializes a local git repo at the workspace root, writes a strict whitelist `.gitignore`, and creates an initial checkpoint commit. It does not configure a remote. If the workspace already has a git repo without the Shrimpy checkpoint whitelist, init refuses to adopt it.

The default whitelist tracks:

```text
.gitignore
profile/WORKSPACE.md
profile/SYSTEM.md
profile/USER.md
config/shrimpy.json
config/channels.json
agents/*/SOUL.md
agents/*/watches.json
agents/*/skills/**
skills/**
```

It ignores runtime state, channel logs, sessions, auth, model metadata, media, workspace and agent `context/`, and agent `vault/` and `projects/` directories. This keeps automatic checkpoints focused on configuration and agent setup, not prompt memory or private saved work.

```bash
shrimpy workspace track status --json
shrimpy workspace track checkpoint --message "update agent setup"
```

When the gateway is running and tracking is enabled, Shrimpy checks about every 15 minutes and creates an automatic checkpoint commit only when checkpointable files changed.

## Search

`shrimpy workspace search <query> [--limit N] [--json]` searches the written workspace knowledge corpus:

- `profile/*.md`
- workspace skills
- agent skills
- `agents/<id>/context/`
- `agents/<id>/vault/`

Results include workspace-relative paths, heading trails, line numbers, scores, clipped snippets, last-modified time, and content-change time. The cache under `runtime/search/` is rebuildable and refreshed lazily by content hash.

```bash
shrimpy workspace search "model policy"
shrimpy workspace index status --json
shrimpy workspace index rebuild --json
```

Workspace search excludes channel logs and session transcripts. Use `shrimpy channels search` for channel messages and `shrimpy sessions search` for transcript recall.

## State And Logs

- Channel logs live under `channels/`; see [channels.md](channels.md).
- Agent memory lives under `agents/<id>/context/`; see [memory.md](memory.md).
- Session transcripts live under `agents/<id>/sessions/`; see [sessions.md](sessions.md).
- Gateway logs live at `runtime/logs/gateway.log`; read them with `shrimpy gateway logs`.
- Watch run state lives under `runtime/watches/`; next-run state lives in `state/watch-clock.json`.
- Worker records live in `state/workers.json`; detached worker artifacts live under `runtime/workers/`.
- Identity links live in `state/users.json`; presence lives in `state/user-presence.json`; manage them with `shrimpy users ...`.
- Auth and models live under `state/pi/`.

Use `shrimpy status` for the current workspace/gateway summary before inspecting individual files.
