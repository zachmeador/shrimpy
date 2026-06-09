# SYSTEM

This file gives all Shrimpy agents shared workspace context. Edit it when the workspace's baseline guidance should change.

Install-managed Shrimpy app checkout lives under `{{APP_PATH}}`; source is under `{{SOURCE_PATH}}`; stable project docs live under `{{DOCS_PATH}}`. Start with `README.md`, then `reference/`. Treat `musings/` and `research/` as design history unless a reference doc or backlog item points there.

## Framework Map

- Workspace: the persistent home for `profile/`, `config/`, `agents/`, `state/`, `runtime/`, `channels/`, `media/`, `vault/`, `projects/`, and `skills/`. Docs: `reference/workspace.md`, `reference/configuration.md`.
- Agents: persistent actors with identity, memory, skills, watches, sessions, and their own vault/projects space. Docs: `reference/architecture.md`, `reference/workspace.md`.
- Channels: append-only message logs and the shared comms layer. Membership controls which agents can see a channel. Docs: `reference/channels.md`.
- Sessions: resumable private working contexts for one agent in a local session or channel. Docs: `reference/sessions.md`, `reference/compaction.md`.
- Runtime: direct local sessions, gateway channel dispatch, watch runs, and child runs. Docs: `reference/runtime.md`.
- Context: stable prompt sections plus turn-scoped live context. Docs: `reference/context-assembly.md`, `reference/turn-context.md`.
- Memory: agent-owned Markdown under `agents/<id>/context/`; path-indexed turn slices live under `context/people/` and `context/channels/`. Docs: `reference/memory.md`.
- Skills: session instruction/resource bundles under workspace or agent skill directories. Docs: `reference/skills.md`.
- Watches and gateway: agent-owned background attention rules; the gateway runs surfaces, drains channel messages, and advances watches. Docs: `reference/runtime.md`, `reference/configuration.md`.
- Surfaces: transport adapters such as Telegram that translate external threads into channels and deliver channel messages back out. Docs: `reference/surfaces.md`.
- Tools: Shrimpy channel/publication tools plus Pi/runtime tools when available. Docs: `reference/tools.md`, `reference/security.md`.

## Coding Work

Handle small edits, scripts, and apps directly when tools and context are enough. For larger work, optional delegation is preferred when a real worker/session handoff exists. Handoffs should include the user's ask, useful recent context, constraints, current state, and done criteria.

## CLI Breadcrumbs

When the `bash` tool is available, useful inspection paths include:

- Workspace/runtime: `shrimpy status`, `shrimpy context --config`
- Context: `shrimpy context --sections`, `shrimpy context --turn`, `shrimpy context sources list`
- Agents: `shrimpy agent list`, `shrimpy agent show <id>`, `shrimpy agent inspect <id>`
- Channels: `shrimpy channels`, `shrimpy channels show <name>`, `shrimpy channels read <name>`, `shrimpy channels members <name>`
- Sessions: `shrimpy sessions list [channel]`, `shrimpy sessions compaction <channel>`
- Watches/gateway: `shrimpy watches`, `shrimpy watches show <agent-id>/<watch-id>`, `shrimpy gateway status`, `shrimpy gateway logs`
- Skills/models/users: `shrimpy skills list`, `shrimpy models`, `shrimpy users list`

## Skills

When asked to add a skill from a URL, GitHub repo, or local path, default to the current agent: `shrimpy skills add <source> --agent <id>`. Use `--workspace` only when the user explicitly asks to make the skill available to all agents.

Use `shrimpy skills bind` and `shrimpy skills unbind` to change visibility for an already installed package. Agent-owned local skills under `agents/<id>/skills/` are allowed; run `shrimpy skills validate --agent <id>` after changing skills.

## Storage Breadcrumbs

Use `vault/` for saved artifacts and collections. Use `projects/` for code, apps, experiments, and focused work folders. Use `agents/<id>/context/` only for memory intended to load into prompts.

When the user explicitly asks an agent to remember something, persist the relevant Markdown note before claiming it will be remembered. If it cannot be persisted now, say that plainly.

## Policy

*Keep it shrimple*
