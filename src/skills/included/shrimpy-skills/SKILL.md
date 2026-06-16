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

If you need exact local paths, read `profile/WORKSPACE.md` first. It should point to the active workspace, app checkout, reference docs, included skill sources, workspace skill root, and agent skill path stems. For more detail after this skill, check `docs/reference/skills.md`; use `docs/reference/workspace.md` for storage layout and precedence.

## Decide

Choose the smallest owner and source:

- workspace skill: behavior any agent may use;
- agent skill: behavior local to one agent, or an intentional override;
- included package copy: shipped Shrimpy behavior the workspace should own visibly;
- local/URL/GitHub package copy: external behavior the user wants installed and drift-tracked;
- `new`: original local skill authored in this workspace.

Ask before broad skill installs or updates. Package copies are real files under `skills/` or `agents/<id>/skills/`; local edits are allowed and `shrimpy skills list` reports modified package copies.

## Commands

```bash
shrimpy skills show <id> --agent <id>
shrimpy skills new <id> --workspace --description "<when to use it>"
shrimpy skills new <id> --agent <agent-id> --description "<when to use it>"
shrimpy skills add included:<id> --workspace
shrimpy skills add included:<id> --agent <agent-id>
shrimpy skills add <source> --workspace --dry-run --json
shrimpy skills add <source> --agent <agent-id> --path <skill-dir>
shrimpy skills update <id> --workspace --dry-run
shrimpy skills update <id> --agent <agent-id>
shrimpy skills remove <id> --agent <agent-id>
shrimpy skills validate [id] --agent <agent-id>
```

`add` uses the package's own Pi skill name as the id. Use `--path` to choose one candidate from a multi-skill GitHub repo, and `--all` only when the user really wants every discovered package.

## Author

Keep `SKILL.md` short: trigger, decisions, safety boundaries, intended agent behavior, and doc breadcrumbs. Put reusable Shrimpy workflow behavior in the relevant Shrimpy skill. Put durable feature facts, command details, schemas, and long examples in `docs/reference/` or a focused project note.

Do not bury reusable app knowledge in one agent's private skill. If several agents would benefit, move the reusable behavior into a workspace skill or included Shrimpy skill and point durable details to docs.

The directory id and frontmatter `name` must match. Use `description` for model-visible trigger wording. Use `disable-model-invocation: true` when a skill should be available only by explicit preload, watch, or user invocation. Treat `allowed-tools` as a compatibility declaration, not a permission grant.

## Validate

Before calling the work done, run:

```bash
shrimpy skills validate --agent <agent-id>
```

Also run `shrimpy skills list --agent <agent-id>` when the change affects package assignment, modified package state, or agent/workspace precedence.

Do not edit `state/skills/packages.json` by hand, edit generated mirrors, treat skill visibility as authorization, or copy whole docs into a skill.
