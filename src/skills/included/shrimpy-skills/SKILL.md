---
name: shrimpy-skills
description: Use when creating, installing, removing, validating, or debugging Shrimpy workspace and agent skills.
---

# Shrimpy Skills

Use skills for repeatable agent behavior, not as command catalogs or permission rules.

Start with:

```bash
shrimpy skills list --agent <id>
shrimpy skills validate --agent <id>
```

Choose the smallest owner:

- workspace skill for behavior any agent may use;
- agent skill for one agent's local workflow;
- included or external package copy when starting from a shipped or fetched package.

Use `shrimpy skills new`, `add`, `update`, `remove`, `show`, and `validate` before editing package state by hand. For included Shrimpy skills, use `shrimpy skills add included:<id> --agent <id>` or `--workspace`; installed package copies are real workspace files and local edits are allowed. Keep `SKILL.md` short: trigger, choices, safety boundaries, intended agent behavior, and doc breadcrumbs. Put reusable workflow behavior in the relevant Shrimpy skill and durable facts, command details, schemas, and long examples in reference docs.

Do not edit generated mirrors, treat skill visibility as permission, or copy whole docs into a skill.
