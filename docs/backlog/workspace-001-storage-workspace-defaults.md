# 🦐 WORKSPACE-001: Storage Workspace Defaults

Status: todo
Priority: P1
Area: Workspace

## Why

Fresh Shrimpy workspaces need clearer defaults for where agents put ordinary
working files and user-owned material. Today the starter guidance names agent
roots, context, vaults, state, runtime files, sessions, and logs, but it does
not establish a simple storage model.

The default guidance should make a few ordinary filesystem homes obvious:

- `vault/`: shared user-organized collections, primarily Markdown, arranged in
  whatever lightweight shape the user wants.
- `projects/`: workspace-level projects for apps, app-agents, experiments, or
  other tightly scoped things that should be useful across agents.
- `agents/<id>/workspace/`: the agent's own working area for active project
  files, drafts, intermediate artifacts, and other material owned by that
  agent.

This keeps active work and user collections separate from prompt context,
durable memory, per-agent loose files, channel logs, runtime state, and provider
auth.

## Build

- Add default storage guidance to `profile/WORKSPACE.md` and
  `profile/SYSTEM.md` starter templates.
- Update reference docs to show `vault/`, `projects/`, and
  `agents/<id>/workspace/` in the workspace layout.
- Update `shrimpy setup init` to create the shared `vault/`, shared
  `projects/`, and default agent `agents/shrimpy/workspace/` directories.
- Update setup validation resources and setup-init tests for the new seeded
  directories.
- Clarify when an agent should use `vault/`, `projects/`,
  `agents/<id>/workspace/`, `agents/<id>/context/`, and
  `agents/<id>/vault/`.
- Keep the guidance practical and light: `vault/` is for collections,
  `projects/` is for scoped app/project work, and the agent workspace is for
  that agent's own active files.

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

## Notes

- Related to [VAULT-001](vault-001-default-workspace-collections.md), which can
  deepen the shared `vault/` collection convention after this baseline storage
  model exists.
- Related to [ONBOARD-001](onboard-001.md): guided onboarding should explain
  the storage model in plain terms when a user starts customizing a workspace.

## Done

- Fresh `shrimpy setup init` creates `vault/`, `projects/`, and the default
  agent workspace.
- Starter prompts make the directory choice clear enough for agents to use the
  right location without asking every time.
- Reference docs show the new layout and distinguish workspace, context, vault,
  state, runtime, sessions, and channels.
- Setup validation and setup-init tests cover the new defaults.
