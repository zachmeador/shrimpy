# WORKSPACE

This workspace is the home system that contains Shrimpy agents, channels, sessions, watches, and long-lived state.

- Agent roots live under `agents/`.
- Shared profile instructions live under `profile/`.
- Shared channel logs live under `channels/`.
- Durable machine state lives under `state/`.
- Disposable runtime state lives under `runtime/`.
- Provider auth and model registry live under `state/pi/`.

## Local Paths

- Active workspace: `{{WORKSPACE_PATH}}`
- Shrimpy app checkout: `{{APP_PATH}}`
- Shrimpy source: `{{SOURCE_PATH}}`
- Shrimpy docs: `{{DOCS_PATH}}`
- Pattern docs: `{{DOCS_PATH}}/patterns`
- Reference docs: `{{DOCS_PATH}}/reference`
- Source default skills: `{{SOURCE_PATH}}/setup/templates/skills`
- Source mechanic skills: `{{SOURCE_PATH}}/setup/templates/mechanic/skills`
- Workspace skills: `{{WORKSPACE_PATH}}/skills`
- Agent skills: `{{WORKSPACE_PATH}}/agents/<id>/skills`

Each agent keeps saved files and collections under `agents/<id>/vault/`. Each agent keeps code, apps, experiments, and focused work folders under `agents/<id>/projects/`. Do not put channel logs, runtime state, sessions, provider auth, or generated workspace state in either directory.

Each agent root can also contain:

- `context/`: memory and prompt files loaded into that agent.
- `vault/`: that agent's saved files and reports.
- `projects/`: code, apps, or work folders for that agent.

Reports go under `agents/<id>/vault/<kind>/`, for example `agents/security/vault/audits/` or `agents/mechanic/vault/assessments/`. Do not put reports in `context/`. Put a reference in `context/` only if the agent should load it every run.
