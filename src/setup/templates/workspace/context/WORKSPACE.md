# WORKSPACE

This file carries local workspace details and path breadcrumbs for Shrimpy agents. Keep shared Shrimpy/Pi framing in `context/SYSTEM.md` and durable user preferences in `context/USER.md`.

## Local Paths

- Workspace: `{{WORKSPACE_PATH}}`
- Shrimpy checkout: `{{APP_PATH}}`
- Shrimpy runtime bin: `{{WORKSPACE_PATH}}/runtime/bin`
- Shrimpy command: `{{WORKSPACE_PATH}}/runtime/bin/shrimpy`
- Source: `{{SOURCE_PATH}}`
- Docs: `{{DOCS_PATH}}`
- Reference docs: `{{DOCS_PATH}}/reference`
- Included skills: `{{SOURCE_PATH}}/skills/included`
- Workspace skills: `{{WORKSPACE_PATH}}/skills`
- Agent skills: `{{WORKSPACE_PATH}}/agents/<id>/skills`

## Storage

- Shared workspace context: `context/`
- Workspace owner context: `context/USER.md`
- Agent identity: `agents/<id>/SOUL.md`
- Agent context and prompt-loaded memory: `agents/<id>/context/`
- Saved artifacts and reports: `agents/<id>/vault/`
- Code, apps, experiments, and focused work folders: `agents/<id>/projects/`

Use the `remember` skill when the user asks to save, capture, collect, archive, or remember something for later. Persist the relevant Markdown note before claiming it will be remembered.

## CLI

- Workspace/runtime: `shrimpy status`, `shrimpy context --config`
- Context: `shrimpy context --sections`, `shrimpy context turn`, `shrimpy context sources list`
- Agents: `shrimpy agent list`, `shrimpy agent show <id>`, `shrimpy agent inspect <id>`
- Channels: `shrimpy channels`, `shrimpy channels read <name>`, `shrimpy channels members <name>`
- Sessions/watches/gateway: `shrimpy sessions list`, `shrimpy watches`, `shrimpy gateway status`
- Skills/models/users: `shrimpy skills list`, `shrimpy models`, `shrimpy users list`
