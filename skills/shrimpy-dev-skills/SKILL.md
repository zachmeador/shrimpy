---
name: shrimpy-dev-skills
description: Use when editing Shrimpy included skill packages, repository developer skills, or generated skill mirrors.
---

# Shrimpy Dev Skills

Edit source, not mirrors:

- included Shrimpy skill packages: `src/skills/included/`
- repository developer skills: `skills/`

Keep `SKILL.md` brief: trigger, decisions, safety boundaries, validation, and doc breadcrumbs. Put durable feature facts, schemas, and long examples in `docs/reference/`.

After editing root `skills/`, run:

```bash
npm run build:skills
```

Do not hand-edit `.agents/skills/`, `.claude/skills/`, or `CLAUDE.md`; they are generated mirrors. Validate runtime skills with `shrimpy skills validate` when the change affects included packages or workspace-visible skills.
