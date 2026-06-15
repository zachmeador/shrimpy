---
name: skill-management
description: Use when creating, installing, binding, validating, or debugging Shrimpy workspace and agent skills.
---

# Skill Management

Use skills for repeatable agent behavior, not as command catalogs or permission rules.

Start with:

```bash
shrimpy skills list --agent <id>
shrimpy skills validate --agent <id>
```

Choose the smallest owner:

- workspace skill for behavior any agent may use;
- agent skill for one agent's local workflow;
- package binding for shared external skills.

Use `shrimpy skills new`, `add`, `bind`, `unbind`, `show`, and `validate` before editing package state by hand. Keep `SKILL.md` short: trigger, choices, safety boundaries, intended agent behavior, and doc breadcrumbs. Put reusable Shrimpy workflow knowledge in pattern docs first, and put durable facts, command details, schemas, and long examples in reference docs.

Do not edit generated mirrors, treat skill visibility as permission, or copy whole docs into a skill.
