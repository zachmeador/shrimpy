---
name: shrimpy-dev-skills
description: Use when editing Shrimpy source default skills, repository developer skills, or generated skill mirrors.
---

# Shrimpy Dev Skills

Edit source, not mirrors:

- workspace/default skills: `src/setup/templates/skills/`
- mechanic defaults: `src/setup/templates/mechanic/skills/`
- repository developer skills: `skills/`

Keep `SKILL.md` brief: trigger, decisions, safety boundaries, validation, and doc breadcrumbs. Put feature facts and long examples in `docs/reference/` or `docs/patterns/`.

After editing root `skills/`, run:

```bash
npm run build:skills
```

Do not hand-edit `.agents/skills/`, `.claude/skills/`, or `CLAUDE.md`; they are generated mirrors. Validate runtime skills with `shrimpy skills validate` when the change affects setup templates or workspace-visible skills.
