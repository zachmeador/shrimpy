---
name: shrimpy-skills
description: Use when the person asks you to write, change or fix a skill, or asks why an agent didn't pick one up.
---

# Making a skill

A skill is a folder with a `SKILL.md`: instructions for one kind of job, read when that job comes up. Write one when the person keeps explaining the same job, or when a way of working should go with an agent. A skill teaches. It allows nothing the agent couldn't already do.

## Make one

1. Make `skills/<name>/SKILL.md` in the home of the agent that should have it. The folder's name is the skill's name unless the front matter says another.
2. Start the file with front matter between `---` lines. `description` is required and `name` is optional:

   ```text
   ---
   name: garden-notes
   description: Use when the person asks what to plant, water or prune, or what happened in the garden last week.
   ---
   ```

3. Under it, write the steps. Lead with what to do and put the common case first. Say when doing nothing is right. Keep it short enough to read in the middle of a task, about 80 lines. Check each shrimpy command in it with `--help`, as in `shrimpy agent init --help`.
4. `shrimpy agent reload <agent>` makes a running agent read its skills again. Without it, the change waits for the agent's next start.

## The description decides

Every request carries every skill's name and description, and the agent picks from that list in the middle of something else. It reads the rest of the skill only after it has picked.

- Say when to use it, in the words the person would use. "Use when the person asks what to plant, water or prune" gets picked. "Garden knowledge" doesn't.
- Name the situation, not the contents. What is inside is for after the choice.
- One sentence. Anything longer is paid for on every request.
- If two skills could both fit, each says what sets it apart.

## Where an agent sees it

Under `<skills>`, one entry for each skill: its name, its description and the path of its `SKILL.md`. Every agent is shown the skills that come with Shrimpy as well as its own. A skill in a home with the same name as one that comes with Shrimpy replaces it, so a copy edited in one home changes it for that agent alone. To give several agents the same skill, link its folder into each home's `skills/`.

Other files in a skill's folder are not shown. The `SKILL.md` can name them by path for the agent to read when it needs them. A folder with no `SKILL.md` is not a skill, and neither is a hidden one.

`shrimpy agent context <agent>` shows the `<skills>` section as the agent will get it. A skill with no front matter or no description is left out, and the same output names it and says why.
