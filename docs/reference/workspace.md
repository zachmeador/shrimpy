# 🦐 Workspace

The workspace is Shrimpy's persistent home directory. By default it is `.shrimpy/` under the project root; the actual path comes from `~/.shrimpy-workspace.json`.

## Layout

```text
profile/WORKSPACE.md            shared workspace/home instructions
profile/SYSTEM.md               Shrimpy + Pi guidance, memory conventions, tool list
profile/USER.md                 workspace owner identity and preferences
config/shrimpy.json             main runtime config
config/channels.json            channel membership
config/schedules.json           optional workspace-level scheduler definitions
agents/                         per-agent workspaces
state/pi/auth.json              provider credentials
state/pi/models.json            model registry
state/users.json                identity links (transport→userId) + workspace owner
state/scheduler.json            persisted scheduler next-run timestamps
state/telegram/                 Telegram polling offsets
runtime/cursors/channels.json   gateway channel cursors
runtime/cursors/surface-threads.json addressed-agent state for surface threads
runtime/briefings/              generated turn briefing state
channels/                       append-only channel logs
media/                          downloaded media
runtime/logs/gateway.log        gateway runtime log
skills/                         workspace-level shared skills
docs/framework/                 framework reference material
```

Each agent workspace under `agents/<id>/` contains:

```text
SOUL.md                         identity and voice
context/                        agent-owned durable Markdown context
vault/                          loose files and working material
schedules.json                  agent-owned recurring work
skills/                         agent-level skill bundles
sessions/                       Pi session persistence
```

## Context Resources

Stable prompt material loaded into an agent session before the per-turn briefing arrives:

- `profile/WORKSPACE.md` defines shared system/home context.
- `profile/SYSTEM.md` covers Shrimpy framework conventions, Pi harness guidance, memory conventions, and tool/inspection guidance.
- `profile/USER.md` declares workspace-owner identity (name, surface handles, hard preferences).
- `SOUL.md` defines who an agent is.
- `context/*.md` is the agent's long-lived session context: identity notes, habits, projects, and other durable working knowledge.
- `context/people/<actor-id>.md` and `context/channels/<name>.md` are loaded only for matching turns.

`shrimpy setup init` creates baseline files from `src/setup/templates/`.

Durable machine state lives under `state/`. Disposable runtime state lives under `runtime/` and surfaces at turn time through the context envelope.

## State And Logs

- Channel logs are append-only JSONL files under `channels/`.
- Agent memory is plain Markdown under `agents/<id>/context/`; agents update it through normal file edits during scheduled upkeep.
- Identity links live in `state/users.json`. The optional `owner` field names the canonical workspace user; CLI publishing routes through that identity when set. Manage with `shrimpy users list|get-owner|set-owner`.
- Session transcripts live under each agent's `sessions/` directory. Each channel/session label has one directory containing its Pi `.jsonl` files. Reset and restore state is tracked inside those JSONL files with Shrimpy custom entries.
- Gateway logs live at `runtime/logs/gateway.log`, readable through `shrimpy gateway logs`.
- Surface cursors and generated turn-context state live under `runtime/`. Scheduler state lives under `state/`.
- Auth and models live under `state/pi/`, isolating Shrimpy from a user's stock Pi config.
