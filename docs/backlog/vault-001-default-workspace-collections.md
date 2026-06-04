# 🦐 VAULT-001: Default Workspace Collection Conventions

Status: todo
Priority: P2
Area: Workspace

## Why

Shrimpy has an agent `vault/` for loose files and working material, but fresh
workspaces do not give agents a clear default home for user-owned things people
throw at the agent from chat: recipes, household notes, travel ideas, research
links, purchase comparisons, and similar durable collections.

The default behavior should gently encourage a predictable filesystem shape
without creating a new storage subsystem. For example, when a user says
`[url] add this recipe to my collection, make it extra spicy and 1.5 the
portions`, the agent should have enough starter context to store a normalized
Markdown recipe under `[workspace]/vault/recipes/` unless the user has told it
to use a different place.

## Current State

- Fresh setup now creates shared `vault/` and `projects/` directories with
  `.gitkeep`, plus `agents/shrimpy/vault/`.
- Starter `WORKSPACE.md`, `SYSTEM.md`, and `docs/reference/workspace.md`
  describe shared `vault/`, shared `projects/`, per-agent `vault/`, and
  per-agent `projects/`.
- Setup tests cover the seeded shared-vault/shared-projects paths and the
  per-agent vault path.
- The remaining work is the collection-specific guidance: vault git repo,
  strict text-first `.gitignore`, recipe example, and commit guidance for kept
  vault changes.

## Build

- Add a short workspace-collections convention to the starter context.
- Introduce `[workspace]/vault/` as the optional shared home for user-owned
  durable collections.
- Clarify the distinction between `[workspace]/vault/` for shared user
  collections and `agents/<id>/vault/` for the agent's own collections and
  generated outputs, following the storage model in
  [workspace.md](../reference/workspace.md). Code projects and tightly scoped
  directories belong in `agents/<id>/projects/`.
- Seed `[workspace]/vault/` as its own lightweight git repo so user collections
  can be versioned without mixing with Shrimpy runtime state.
- Add strict default ignore rules in the vault repo. Track only simple
  inspectable text formats by default, such as Markdown, plain text, CSV, JSON,
  YAML, and TOML. Ignore everything else unless the user explicitly loosens the
  rules.
- Update `src/setup/templates/WORKSPACE.md`, `src/setup/templates/SYSTEM.md`,
  and `docs/reference/workspace.md`.
- Include a compact recipe example in the prompt guidance: keep the source URL,
  write the adapted recipe as Markdown, and place it under
  `vault/recipes/<slug>.md`.
- Add light agent guidance: after changing vault files, mention the diff or
  saved path and commit changes the user says they want to keep.
- Keep categories loose and user-led. Agents can create a reasonable collection
  folder when the request is obvious, but should ask before inventing a large
  taxonomy.

## Boundaries

- Do not add a database, vector store, hidden router, or special vault runtime.
- Do not auto-commit every vault write. Commits should reflect user-confirmed
  keepers, not transient scratch.
- Do not migrate existing workspaces or move existing agent-vault files.
- Do not seed many empty category directories by default.
- Do not add CLI commands for a convention-only change. If later vault behavior
  grows beyond files and prompt guidance, expose that behavior through CLI
  subcommands first.

## Done

- Fresh workspace prompts describe the shared vault convention clearly.
- The recipe example maps naturally to `[workspace]/vault/recipes/<slug>.md`.
- Fresh workspace vaults have git tracking with strict text-first ignore rules.
- Agents know to commit vault changes when the user wants to keep them.
- Existing per-agent `vault/` semantics remain clear.
- Reference docs show the optional shared vault location.
- Setup tests cover any newly seeded workspace path.
