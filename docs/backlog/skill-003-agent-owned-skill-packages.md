# 🦐 SKILL-003: Agent-Owned Skill Packages

Status: review
Priority: P2
Area: Skills
Depends On: [SKILL-001](skill-001-shrimpy-workflows-skill.md), [SKILL-002](skill-002-shrimpy-skill-coverage-gaps.md)

## Why

Shrimpy's workspace should stay explorable: the directories and files should show what an agent actually has. Source-default skills are clean for programmers, but dirty for users and agents because assigned behavior lives in hidden source paths instead of the agent's own `skills/` directory.

Shrimpy has managed skill package concepts for provenance and updates. The pivot is to use those concepts for every package source, including Shrimpy-included skills, while making assignment mean an owned file copy under the target `skills/` directory. Light tracking should explain whether the agent's copy still matches the package source or has been locally modified. Agents can then own their skills and modify them when the user allows, while the mechanic can migrate or refresh packages without guessing.

## Current State

- Shrimpy included skill sources live under `src/skills/included/<id>/`.
- Fresh setup copies assigned included packages into `skills/` or `agents/<id>/skills/` and records installed-copy provenance in `state/skills/packages.json`.
- Workspace `skills/` and agent `agents/<id>/skills/` roots are still additive authoring and override surfaces.
- External skills use the same visible-copy package install model as included skills, with provenance in `state/skills/packages.json`.
- `codex-web-search` is an included source package but is not assigned during setup.
- Shrimpy how-to skills use the `shrimpy-` prefix. Behavior skills such as `memory-management` use plain names.

## Build

1. Add Shrimpy-included skills as a first-class package source kind, `sourceKind: "included"`, using the existing skill package concepts instead of creating a parallel package system.
2. Move shipped Shrimpy skill package sources into `src/skills/included/<id>/SKILL.md`, with a small source catalog that records id, category, and setup assignment policy.
3. Change package assignment semantics so assigning any package to an agent copies the package into the owning agent's directory, for example `agents/mechanic/skills/shrimpy-setup/SKILL.md`, instead of adding visibility indirection to a shared package path.
4. Keep workspace-level `skills/` and agent-level `agents/<id>/skills/` loading as local authoring surfaces. Assigned packages become real files in those roots; user-created skills keep working.
5. Replace hidden visibility records with install records keyed by target, such as `workspace:<id>` and `agent:<agent-id>:<id>`, that track package id, package source, assigned scope, installed path, package source hash or revision, installed hash, and last refresh. Compute `modified` by comparing the tracked source hash to the current installed file hash; do not treat local edits as invalid.
6. Add or extend CLI support so `shrimpy skills list` and `shrimpy skills validate --json` show package source, assignment, installed path, and modified status. Support installing an included package with an inspectable command such as `shrimpy skills add included:<id> --agent <agent-id>`, and remove managed installed copies with `shrimpy skills remove`.
7. Rename Shrimpy how-to included skills with a `shrimpy-` prefix: `shrimpy-agents`, `shrimpy-channels`, `shrimpy-watches`, `shrimpy-skills`, `shrimpy-coding-delegation`, `shrimpy-setup`, `shrimpy-workspace-migration`, `shrimpy-security-audit`, and `shrimpy-hygiene-audit`. Keep behavior skills unprefixed, including `memory-management`, `journal-daily`, `journal-compact`, and `vault-capture`.
8. Keep `shrimpy-coding-delegation` as an included system-level package because Shrimpy can create Pi sessions from install. It should not be Codex-specific, though it can mention Codex as a strong worker option when available.
9. Keep `codex-web-search` as an included but unassigned package. Do not add app-gating in this item; Shrimpy does not yet have a runtime app-gate mechanism.
10. Replace broad mechanic-only general knowledge with a short mechanic context directive: use assigned Shrimpy skills first, then `profile/WORKSPACE.md` paths, then `docs/reference/`, then source; prefer `shrimpy <command>` inspection; ask before broad or destructive workspace changes.
11. Make mechanic special through its model policy and a few assigned specialty packages, not through hidden general source-only skills. Mechanic specialty assignments are `shrimpy-setup`, `shrimpy-workspace-migration`, `shrimpy-security-audit`, and `shrimpy-hygiene-audit`; shared Shrimpy guidance such as `shrimpy-agents`, `shrimpy-channels`, `shrimpy-watches`, `shrimpy-skills`, and `shrimpy-coding-delegation` is workspace-assigned.
12. Update skill-package refresh behavior so unmodified assigned package copies can be refreshed safely, while modified copies require an explicit review decision before replacement. Broader environment-update migration output remains owned by [SETUP-004](setup-004-safe-environment-update.md).

## Boundaries

- Do not remove agent-level skill loading. `agents/<id>/skills/` remains the visible owned skill surface for each agent.
- Do not hide assigned packages behind source-only references or shared package paths. If an agent has a skill, the workspace should show that skill as a file under the agent or workspace skill root.
- Do not overwrite locally modified assigned skill copies without explicit user approval.
- Do not make `codex-web-search` a default assignment. It is optional and unassigned until a browser/research capability is deliberately installed.
- Do not prefix general behavior skills just because they ship with Shrimpy. Use `shrimpy-` for Shrimpy-specific how-to skills.
- Do not make the mechanic a special reference manual. Mechanic should follow the same skills and docs as other agents, with only narrow maintenance specialty skills.

## Notes

- This pivot supersedes the source-default-only distribution shape from [SKILL-001](skill-001-shrimpy-workflows-skill.md), while keeping its workflow-skill content direction.
- This also narrows [SKILL-002](skill-002-shrimpy-skill-coverage-gaps.md): do not add many new skills until ownership, naming, assignment, and modified-copy tracking are settled.
- Package state solves source provenance and drift checks; assignment is owned installed copies, not hidden visibility bindings.

## Done

- Shrimpy-included skills are represented as managed skill packages, not a separate package system.
- Fresh setup copies assigned packages into agent-owned skill directories and records provenance.
- `shrimpy skills list` and `shrimpy skills validate` report package source, assignment, installed path, and modified status.
- Package records are target-scoped, so the same package id can be installed independently for the workspace and multiple agents.
- `shrimpy skills remove` deletes one managed package copy and its package state record.
- Shrimpy how-to skills use the `shrimpy-` prefix; behavior skills keep plain names.
- `codex-web-search` is included and unassigned by default; app-gating is left for a future app capability mechanism.
- `shrimpy-coding-delegation` remains an included system-level skill for Pi session delegation and is not Codex-only.
- Mechanic has a brief maintenance context directive and only narrow specialty assigned skills.
- `shrimpy skills update` preserves locally modified assigned skill copies unless the user explicitly chooses to replace them; broader environment-update migration remains owned by [SETUP-004](setup-004-safe-environment-update.md).
