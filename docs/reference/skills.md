# 🦐 Skills

Agent Skills are Pi-style capability bundles stored in the Shrimpy workspace.
They are session prompt resources, not a separate decision or automation control
plane.
Repository developer skills under `src/skills/` are source-tree prompts for
working on Shrimpy itself; they are not automatically installed into a Shrimpy
workspace.

Shrimpy follows the [Agent Skills specification](https://agentskills.io/specification)
through Pi's skill loader and prompt renderer. Shrimpy adds workspace-specific
policy on top: skill directories live under workspace or agent `skills/` roots,
agent skills override workspace skills by directory id, and the directory id
must match frontmatter `name`.

## Locations

Shrimpy recognizes two skill scopes:

```text
skills/<id>/SKILL.md                    workspace skill
agents/<agent-id>/skills/<id>/SKILL.md  agent skill
```

Agent skills win over workspace skills with the same Shrimpy id. Nested ids are
allowed, for example `skills/web/fetch/SKILL.md`, but ids are normalized and
must not contain absolute paths, `..`, backslashes, `~`, `:`, or empty segments.

## Bundle Shape

`SKILL.md` is the standard Agent Skills entrypoint. It must contain
Pi-compatible YAML frontmatter:

```markdown
---
name: memory-management
description: Use for periodic memory upkeep and workspace context hygiene.
---

# Memory Management

Instructions for when and how to use this skill.
```

The public Shrimpy id is the directory id, while Pi's slash command name comes
from frontmatter `name`. They must match so `shrimpy --skill <id>`, watches,
and `/skill:<name>` all point at the same name. If they differ,
`shrimpy skills validate` fails.

Optional bundle directories:

```text
scripts/      small helper scripts the skill may ask the model to run
references/   supporting docs or examples
assets/       files, media, templates, or other inputs
```

Skill instructions should reference those files relative to the skill root. Pi's
prompt tells the model to resolve relative paths against the `SKILL.md`
directory before using tools.

Shrimpy currently relies on Pi for Agent Skills validation and runtime behavior.
`name`, `description`, and `disable-model-invocation` affect Shrimpy sessions;
other standard frontmatter fields may be present, but Shrimpy treats them as
skill metadata rather than policy.

## Loading Model

Shrimpy resolves the effective skill entries for the active agent, then passes
only those winning `SKILL.md` paths to Pi. Pi's ambient skill discovery remains
disabled, so cwd-local `.pi/skills`, `.agents/skills`, global Pi user skills,
and settings-installed skills do not silently enter Shrimpy sessions.

Pi owns skill parsing, validation diagnostics, the `<available_skills>` prompt
block, `/skill:<name>` expansion, autocomplete, and RPC command discovery.
Shrimpy adds policy around workspace/agent scope, safe paths, id precedence,
inspection, and local file management.

At session start, Pi advertises visible skills by name, description, and
location. Full `SKILL.md` content is loaded only when the user preloads a skill
with `--skill <id>`, a watch names a skill, the model reads the skill file,
or the user invokes `/skill:<name>`. Skills with `disable-model-invocation: true`
are not shown in Pi's prompt block, but can still be invoked explicitly.

The first implementation assumes workspace skills are intentionally curated. If
more than 20 visible skills are effective for an agent, Shrimpy reports a warning
through `shrimpy skills list` and `shrimpy skills validate`; it does not
automatically rank, filter, or hide skills.

## CLI

```bash
shrimpy skills list [--agent <id>] [--json]
shrimpy skills show <id> [--agent <id>]
shrimpy skills add <id> [--agent <id>|--workspace] [--description <text>] [--force]
shrimpy skills install <source> [--agent <id>|--workspace] [--id <id>] [--force]
shrimpy skills validate [id] [--agent <id>] [--json]
```

`add` scaffolds a local bundle. `install` copies a local skill directory that
contains `SKILL.md`, or a Markdown file that becomes `SKILL.md`. Both commands
refuse to replace an existing skill unless `--force` is present.
