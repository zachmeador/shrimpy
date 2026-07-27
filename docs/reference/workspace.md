# 🦐 Workspace

The workspace is Shrimpy's persistent home directory. It holds the agents, model-visible context, config, channel logs, runtime state, skills, auth, models, media, and saved agent work. By default the workspace is `~/.shrimpy/`; a pointer file can select another path. See [configuration.md](configuration.md) for pointer resolution.

## Layout

```text
context/SYSTEM.md                  shared Shrimpy/Pi baseline context
context/USER.md                    durable workspace-owner identity and hard preferences
context/WORKSPACE.md               local workspace details and path breadcrumbs
context/                           additional workspace-level prompt context
config/shrimpy.json                main runtime config
config/channels.json               channel membership, manifests, and transport bindings
agents/                            per-agent workspaces
skills/                            workspace-level shared skills
channels/                          append-only channel logs
media/                             downloaded inbound surface media, currently Telegram photos/photo groups
state/pi/auth.json                 provider credentials
state/pi/models.json               Pi-visible model registry
state/pi/models-store.json         cached dynamic provider catalogs
state/users.json                   identity links plus optional workspace owner
state/user-presence.json           last active chat surface channel per known user
state/watch-clock.json             persisted watch next-run timestamps and schedule keys
state/worker-backends.json         persisted worker backend availability
state/workers.json                 coding worker records
state/telegram/                    Telegram polling offsets
runtime/cursors/channels.json      gateway channel cursors
runtime/cursors/surface-threads.json addressed-agent state for surface threads
runtime/bin/                       workspace-local command shims
runtime/context/                   generated turn-context state
runtime/search/                    rebuildable workspace search cache
runtime/watches/                   watch active-run state and run history
runtime/workers/                   worker JSONL, stderr, and last-message artifacts
runtime/logs/gateway.log           gateway runtime log
```

`state/` is durable machine state. `runtime/` is rebuildable or disposable process state. Channel logs and sessions are records, not prompt memory. Auth, custom model configuration, and cached dynamic provider catalogs stay under `state/pi/` so Shrimpy does not depend on a user's stock Pi config.

## Context Directories

`context/` directories are part of the workspace and agent contract. They are model-visible material, not general storage. Anything loaded from one of these directories goes into agent context for all or some sessions.

- `context/` at the workspace root is shared prompt material. The default source list includes `workspace:context/`, so every Markdown file under this tree loads into normal sessions unless config narrows the source list.
- `agents/<id>/context/` is the owning agent's prompt memory. The default source list includes `agent:context/`, so every Markdown file under this tree loads into normal sessions for that agent.

These directories are intentionally open-ended. Add files, modify seeded files, and create subtrees when the context needs structure. Directory sources load Markdown recursively in deterministic path order.

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

`shrimpy agent add <id>` scaffolds an agent root with identity and working directories. `context/` is part of the expected agent root even when it starts empty. Setup creates default roots for `shrimpy` and `mechanic`; the mechanic gets default context such as `context/scope.md`. Agent `cwd` can point at the root, the workspace, or another absolute path while Shrimpy-owned files remain under the root.

Agent-owned skills under `agents/<id>/skills/<skill-id>/SKILL.md` override workspace skills with the same id. Workspace skills live under `skills/<skill-id>/SKILL.md`. Managed package provenance and drift state live in `state/skills/packages.json`. See [skills.md](skills.md).

## Storage Rules

Use the smallest directory that matches how the file will be used:

- `context/` is prompt memory: facts, preferences, active references, and notes that should go to agents. Use workspace `context/` for shared configured sources and agent `context/` for one agent's memory. Keep it extremely character-count efficient because recursive Markdown under configured context directories is prompt-loaded.
- `vault/` is saved material: reports, captures, journal entries, research notes, records, and other durable files that should not load by default.
- `projects/` is working material: code, apps, generated tools, experiments, and focused project folders.
- `sessions/` is Pi transcript persistence; do not hand-file user artifacts there.
- `channels/` is shared message history; do not copy it into an agent root.

Do not put channel logs, runtime state, sessions, auth, model metadata, media, or watch clock state under `vault/` or `projects/`. Reports belong in `vault/<kind>/`, for example `agents/mechanic/vault/audits/`. Journal bodies belong in `vault/journal/`, with only a tiny `context/journal.md` summary and breadcrumb when always-loaded journal memory is useful. Put only a short reference in `context/` when the agent should load that material every run.

The included `remember` skill owns the capture/save workflow. The workspace doc only defines where saved material belongs.

## Prompt Resources

Baseline workspace prompt material lives under `context/`. `context/SYSTEM.md` carries short Shrimpy/Pi orientation, `context/USER.md` carries durable workspace-owner identity and hard preferences, and `context/WORKSPACE.md` carries local path breadcrumbs, storage notes, and CLI inspection breadcrumbs. The default context source list loads workspace `context/`, the agent's own `SOUL.md`, and all Markdown under `agents/<id>/context/`.

Additional shared workspace memory can live under root `context/` when it should be available to more than one agent or context view. Select the relevant files or directories through context sources.

Setup writes `context/SYSTEM.md`, `context/USER.md`, and `context/WORKSPACE.md` from `src/setup/templates/workspace/context/`; the workspace template fills in local paths. In an install-managed checkout, the app checkout is normally `~/.local/share/shrimpy/app`.

Agent prompt resources live in the agent root:

- `SOUL.md` defines who the agent is.
- `context/**/*.md` is always-loaded agent memory for normal sessions when the default `agent:context/` source is active.

See [memory.md](memory.md) and [context-assembly.md](context-assembly.md).

## Checkpoints

Workspace git checkpoint tracking is opt-in. `shrimpy workspace track init` initializes a local git repo at the workspace root, writes a strict whitelist `.gitignore`, and creates an initial checkpoint commit. It does not configure a remote. If the workspace already has a git repo without the Shrimpy checkpoint whitelist, init refuses to adopt it.

The default whitelist tracks:

```text
.gitignore
context/**
config/shrimpy.json
config/channels.json
agents/*/SOUL.md
agents/*/watches.json
agents/*/skills/**
skills/**
```

It ignores runtime state, channel logs, sessions, auth, model metadata, media, agent `context/`, and agent `vault/` and `projects/` directories. This keeps automatic checkpoints focused on configuration, workspace baseline context, and agent setup, not private saved work.

```bash
shrimpy workspace track status --json
shrimpy workspace track checkpoint --message "update agent setup"
```

When the gateway is running and tracking is enabled, Shrimpy checks about every 15 minutes and creates an automatic checkpoint commit only when checkpointable files changed.

## Search

`shrimpy workspace search <query> [--agent <id>|--all-agents] [--limit N] [--json]` searches the written workspace knowledge visible to the selected agent. Without a selector, it uses the default agent.

- workspace `context/**/*.md`
- workspace skills
- the selected agent's skills
- the selected agent's `context/`
- the selected agent's `vault/`

Agents with `knowledgeScope: "global"` search every agent corpus. The mechanic always has global knowledge scope. `--all-agents` provides an explicit maintainer-wide search.

Results include the effective agent and knowledge scope, workspace-relative paths, heading trails, line numbers, scores, clipped snippets, last-modified time, and content-change time. One cache under `runtime/search/` indexes the complete workspace corpus and records each document's visibility. Search filters the corpus before ranking. The cache is maintained lazily by both `shrimpy workspace search` and turn-context knowledge breadcrumbs. A missing, malformed, or incompatible index is rebuilt automatically. Unchanged files reuse indexed chunks without rereading their contents or rewriting the cache; changed files, visibility, and corpus membership refresh before the current query is ranked.

```bash
shrimpy workspace search "model policy" --agent shrimpy
shrimpy workspace search "model policy" --all-agents
shrimpy workspace index status --json
shrimpy workspace index rebuild --json
```

Workspace search excludes channel logs and session transcripts. Use `shrimpy channels search` for channel messages and `shrimpy sessions search` for transcript recall.

## State And Logs

- Channel logs live under `channels/`; see [channels.md](channels.md).
- Agent memory lives under `agents/<id>/context/`; see [memory.md](memory.md).
- Session transcripts live under `agents/<id>/sessions/`; see [sessions.md](sessions.md).
- Gateway logs live at `runtime/logs/gateway.log`; read them with `shrimpy gateway logs`.
- Watch run state lives under `runtime/watches/`; next-run timestamps live in `state/watch-clock.json`, keyed by schedule so they survive non-schedule watch edits and recompute when the schedule changes.
- Worker records live in `state/workers.json`; detached worker artifacts live under `runtime/workers/`.
- Identity links live in `state/users.json`; presence lives in `state/user-presence.json`; manage them with `shrimpy users ...`.
- Auth, custom models, and cached provider catalogs live under `state/pi/`.

Use `shrimpy status` for the current workspace/gateway summary before inspecting individual files.
