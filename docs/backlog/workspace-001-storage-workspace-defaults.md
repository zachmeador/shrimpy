# 🦐 WORKSPACE-001: Storage Workspace Defaults

Status: todo
Priority: P1
Area: Workspace

## Why

Fresh Shrimpy workspaces need clearer defaults for where agents put ordinary
working files and user-owned material. Today the starter guidance names agent
roots, context, vaults, state, runtime files, sessions, and logs, but it does
not establish a simple storage model.

The default guidance should make a few ordinary filesystem homes obvious.

Shared workspace level, useful across agents:

- `vault/`: shared user-organized collections, primarily Markdown, arranged in
  whatever lightweight shape the user wants.
- `projects/`: workspace-level code projects, app-agents, experiments, or other
  tightly scoped things that should be useful across agents.

Per agent, under `agents/<id>/`:

- `context/`: the agent's durable memory and prompt resources, primarily
  Markdown loaded into the agent every turn.
- `vault/`: the agent's own collections and the outputs it accumulates over
  time, such as periodic reports, audits, and assessments. Mirrors top-level
  `vault/` but scoped to one agent.
- `projects/`: the agent's code projects, or tightly scoped directories
  (Markdown or otherwise) that belong to that agent.

For now agents are trusted to use the shared workspace level without OS
isolation; guidance should keep them non-destructive there until it is clear
they own a given path. This keeps active work and collections separate from
prompt context, channel logs, runtime state, and provider auth.

## Build

- Add default storage guidance to `profile/WORKSPACE.md` and
  `profile/SYSTEM.md` starter templates.
- Update reference docs to show shared `vault/` and `projects/`, plus per-agent
  `agents/<id>/context/`, `agents/<id>/vault/`, and `agents/<id>/projects/` in
  the workspace layout.
- Update `shrimpy setup init` to create the shared `vault/`, shared `projects/`,
  and the default agent's `agents/shrimpy/vault/` directory. Create per-agent
  `projects/` lazily when an agent first needs it rather than seeding it empty.
- Update setup validation resources and setup-init tests for the new seeded
  directories.
- Clarify when an agent should use the shared `vault/` and `projects/` versus
  its own `agents/<id>/context/`, `agents/<id>/vault/`, and
  `agents/<id>/projects/`:
  - `context/` holds durable memory and prompt resources only.
  - `vault/` holds the agent's collections and the kept outputs it generates
    over time.
  - `projects/` holds code projects or tightly scoped directories.
- Give agent-generated durable reports one default home,
  `agents/<id>/vault/<kind>/`, for example `agents/security/vault/audits/` and
  `agents/mechanic/vault/assessments/`. Reports are kept outputs, so they do not
  belong in `context/`, which stays memory and prompt resources. A living
  reference an agent reads each run, such as a maintained inventory, can still
  sit in `context/`.
- Keep the guidance practical and light: `vault/` is for collections,
  `projects/` is for code or scoped project work, and `context/` is for memory
  and prompt resources.

## Boundaries

- Do not move existing files or migrate existing workspaces by default.
- Do not turn storage directories into a database, vector store, or hidden
  routing layer.
- Do not conflate working directories with memory. Durable agent memory remains
  under `agents/<id>/context/`.
- Do not require a rigid taxonomy under `vault/` or `projects/`; users and
  agents should add folders only when the work calls for them.
- Do not seed many empty category directories by default.
- Do not place Shrimpy runtime state, channels, sessions, auth, or watch
  runtime data under these directories.
- Do not assume agents are sandboxed from the shared workspace level yet. Until
  path ownership and OS isolation exist, rely on non-destructive guidance, not
  enforcement.

## Notes

- Related to [VAULT-001](vault-001-default-workspace-collections.md), which can
  deepen the shared `vault/` collection convention after this baseline storage
  model exists.
- Related to [ONBOARD-001](onboard-001.md): guided onboarding should explain
  the storage model in plain terms when a user starts customizing a workspace.
- Related to [SECURITY-001](security-001-agent-sandboxing-security-strategy.md):
  the shared-workspace trust assumption here is what later sandboxing would
  replace with real path ownership and isolation.

## Done

- Fresh `shrimpy setup init` creates shared `vault/` and `projects/`, plus the
  default agent's `context/` and `vault/`.
- Starter prompts make the directory choice clear enough for agents to use the
  right location without asking every time.
- Reference docs show the layout and distinguish per-agent `context/`, `vault/`,
  and `projects/` from shared collections, state, runtime, sessions, and
  channels.
- Setup validation and setup-init tests cover the new defaults.
