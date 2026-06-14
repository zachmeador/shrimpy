# 🦐 VAULT-001: Default Agent Collection Conventions

Status: review
Priority: P2
Area: Workspace

## Why

Shrimpy gives each agent a `vault/` for loose files and working material, but fresh workspaces do not give agents a clear default habit for user-owned things people throw at the agent from chat: recipes, household notes, travel ideas, research links, purchase comparisons, and similar durable collections.

The default behavior should gently encourage a predictable filesystem shape without creating a new storage subsystem. For example, when a user says `[url] add this recipe to my collection, make it extra spicy and 1.5 the portions`, the active agent should have enough starter context to store a normalized Markdown recipe under `agents/<id>/vault/recipes/` unless the user has told it to use a different place.

## Current State

- Fresh setup creates per-agent `vault/` and `projects/` directories with `.gitkeep` for the default agents.
- A source-default `vault-capture` skill carries collection, recipe, and versioning guidance.
- Starter `WORKSPACE.md`, `SYSTEM.md`, and `docs/reference/workspace.md` describe per-agent `vault/` and `projects/`; workflow guidance stays in the source-default skill and reference docs.
- Setup and skill tests cover the seeded per-agent vault/projects paths and source-default vault skill visibility.

## Build

- Add a short workspace-collections convention to the starter context.
- Use `agents/<id>/vault/` as the home for that agent's durable collections.
- Clarify that code projects and tightly scoped directories belong in `agents/<id>/projects/`, following the storage model in [workspace.md](../reference/workspace.md).
- Add guidance for versioning agent-vault keepers through the workspace checkpoint flow or an explicit user-chosen repo, without creating a root-level workspace vault.
- If a vault gets its own repo later, use strict default ignore rules. Track only simple inspectable text formats by default, such as Markdown, plain text, CSV, JSON, YAML, and TOML. Ignore everything else unless the user explicitly loosens the rules.
- Update `src/setup/templates/WORKSPACE.md`, `src/setup/templates/SYSTEM.md`, and `docs/reference/workspace.md`.
- Include a compact recipe example in the prompt guidance: keep the source URL, write the adapted recipe as Markdown, and place it under `agents/<id>/vault/recipes/<slug>.md`.
- Add light agent guidance: after changing vault files, mention the diff or saved path and commit changes the user says they want to keep.
- Keep categories loose and user-led. Agents can create a reasonable collection folder when the request is obvious, but should ask before inventing a large taxonomy.

## Boundaries

- Do not add a database, vector store, hidden router, or special vault runtime.
- Do not auto-commit every vault write. Commits should reflect user-confirmed keepers, not transient scratch.
- Do not migrate existing workspaces or move existing agent-vault files.
- Do not seed many empty category directories by default.
- Do not add CLI commands for a convention-only change. If later vault behavior grows beyond files and prompt guidance, expose that behavior through CLI subcommands first.

## Done

- Fresh workspace prompts describe the agent vault convention clearly.
- The recipe example maps naturally to `agents/<id>/vault/recipes/<slug>.md`.
- Agent vault versioning guidance is clear and does not create a root-level workspace vault.
- Agents know to commit vault changes when the user wants to keep them.
- Existing per-agent `vault/` semantics remain clear.
- Reference docs show the per-agent vault location.
- Setup tests cover any newly seeded workspace path.
