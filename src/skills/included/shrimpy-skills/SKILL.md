---
name: shrimpy-skills
description: Use when creating, installing, removing, validating, or debugging Shrimpy workspace and agent skills.
---

# Shrimpy Skills

Use skills for repeatable agent behavior, not as command catalogs or permission rules.

Start by checking the current visible skill set and package state:

```bash
shrimpy skills list --agent <id>
shrimpy skills validate --agent <id>
```

If you need exact local paths, read `context/WORKSPACE.md` first. It should point to the active workspace, app checkout, reference docs, included skill sources, workspace skill root, and agent skill path stems. For more detail after this skill, check `docs/reference/skills.md`; use `docs/reference/workspace.md` for storage layout and precedence.

## Decide

Choose the smallest owner and source:

- workspace skill: behavior any agent may use;
- agent skill: behavior local to one agent, or an intentional override;
- included package copy: shipped Shrimpy behavior the workspace should own visibly;
- local/URL/GitHub package copy: external behavior the user wants installed and drift-tracked;
- `new`: original local skill authored in this workspace.

Prefer a skill over another persistent agent when the need is reusable research, editing, planning, reviewing, domain knowledge, or another capability that does not require its own enduring identity, separate memory, and independent activity over time.

Ask before broad skill installs or updates. Package copies are real files under `skills/` or `agents/<id>/skills/`; local edits are allowed and `shrimpy skills list` reports modified package copies.

## Apply

For a package install, inspect candidates with `shrimpy skills add <source> --agent <agent-id> --dry-run --json`, then apply to the selected scope. Use `--workspace` instead for shared behavior. `add` uses the package's own skill name as its ID; use `--path` for one candidate and `--all` only when the user wants all candidates.

For updates, run `shrimpy skills update <id> --agent <agent-id> --dry-run` and review local modifications before applying. Use `shrimpy skills new <id>` to scaffold original behavior and subcommand `--help` for exact authoring and removal options.

## Author

Keep `SKILL.md` short: trigger, decisions, safety boundaries, intended agent behavior, and doc breadcrumbs. Put reusable Shrimpy workflow behavior in the relevant Shrimpy skill. Put durable feature facts, command details, schemas, and long examples in `docs/reference/` or a focused project note.

Do not bury reusable app knowledge in one agent's private skill. If several agents would benefit, move the reusable behavior into a workspace skill or included Shrimpy skill and point durable details to docs.

The directory id and frontmatter `name` must match. Use `description` for model-visible trigger wording. Treat `allowed-tools` as a compatibility declaration, not a permission grant.

## Validate

Before calling the work done, run:

```bash
shrimpy skills validate --agent <agent-id>
```

Also run `shrimpy skills list --agent <agent-id>` when the change affects package assignment, modified package state, or agent/workspace precedence.

Do not edit `state/skills/packages.json` by hand, edit generated mirrors, treat skill visibility as authorization, or copy whole docs into a skill.
