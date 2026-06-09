# WORKSPACE

This workspace is the home system that contains Shrimpy agents, channels, sessions, watches, and long-lived state.

- Agent roots live under `agents/`.
- Shared profile instructions live under `profile/`.
- Shared saved files and collections live under `vault/`.
- Shared code, apps, experiments, and focused work folders live under `projects/`.
- Framework reference material lives under `docs/framework/`.
- Shared channel logs live under `channels/`.
- Durable machine state lives under `state/`.
- Disposable runtime state lives under `runtime/`.
- Provider auth and model registry live under `state/pi/`.
- Install-managed Shrimpy app checkout lives under `{{APP_PATH}}`; source lives under `{{SOURCE_PATH}}`; stable project docs live under `{{DOCS_PATH}}`.

Use `vault/` for saved files and collections. Use `projects/` for code, apps, experiments, or focused work folders. Do not put channel logs, runtime state, sessions, provider auth, or generated workspace state in either directory.

Each agent root can also contain:

- `context/`: memory and prompt files loaded into that agent.
- `vault/`: that agent's saved files and reports.
- `projects/`: code, apps, or work folders for that agent. Create it when needed.

Reports go under `agents/<id>/vault/<kind>/`, for example `agents/security/vault/audits/` or `agents/mechanic/vault/assessments/`. Do not put reports in `context/`. Put a reference in `context/` only if the agent should load it every run.
