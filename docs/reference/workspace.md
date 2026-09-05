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
state/skills/packages.json         skill package provenance and drift tracking
state/telegram/                    Telegram polling offsets
runtime/cursors/channels.json      gateway channel cursors
runtime/cursors/surface-threads.json addressed-agent state for surface threads
runtime/bin/                       workspace-local command shims
runtime/context/                   generated turn-context state
runtime/sessions/                  session ownership records
runtime/search/                    rebuildable workspace search cache
runtime/watches/                   watch active-run state and run history
runtime/workers/                   worker JSONL, stderr, and last-message artifacts
runtime/logs/gateway.log           gateway runtime log
```

`state/` is durable machine state. `runtime/` is rebuildable or disposable process state. Channel logs and sessions are records, not prompt memory. Auth, custom model configuration, and cached dynamic provider catalogs stay under `state/pi/` so Shrimpy does not depend on a user's stock Pi config.

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

Skill locations, precedence, and package provenance are described in [skills.md](skills.md#locations).

## Storage Rules

Use the smallest directory that matches how the file will be used:

- `context/` is prompt memory. Use workspace context for shared guidance and agent context for one agent's facts, preferences, and active references. Keep it small; see [context-assembly.md](context-assembly.md#stable-sources) for loading and scoping.
- `vault/` is saved material: reports, captures, journal entries, research notes, records, and other durable files that should not load by default.
- `projects/` is working material: code, apps, generated tools, experiments, and focused project folders.
- `sessions/` is Pi transcript persistence; do not hand-file user artifacts there.
- `channels/` is shared message history; do not copy it into an agent root.

Do not put channel logs, runtime state, sessions, auth, model metadata, media, or watch clock state under `vault/` or `projects/`. Reports belong in `vault/<kind>/`, for example `agents/mechanic/vault/audits/`. Journal bodies belong in `vault/journal/`, with only a tiny `context/journal.md` summary and breadcrumb when always-loaded journal memory is useful. Put only a short reference in `context/` when the agent should load that material every run.

Setup seeds workspace context from `src/setup/templates/workspace/context/`, filling `WORKSPACE.md` with local paths. The included `remember` skill guides capture and saving; [memory.md](memory.md) covers what deserves prompt memory.

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
