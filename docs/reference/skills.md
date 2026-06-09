# 🦐 Skills

Agent Skills are Pi-style capability bundles resolved by Shrimpy and loaded by Pi. They are session prompt resources, not a separate decision or automation control plane. In this repository, developer skills under root `skills/` are source-tree prompts for working on Shrimpy itself. The build mirrors them into `.claude/skills/` and `.agents/skills/` with `DIRECTORY_MANAGED_BY_SHRIMPY_BUILD` marker files so local coding agents can read the same prompts. They are not automatically installed into a Shrimpy workspace.

Shrimpy follows the [Agent Skills specification](https://agentskills.io/specification) through Pi's skill loader and prompt renderer. Shrimpy adds local policy on top: source defaults are sparse and scoped, workspace and agent `skills/` roots remain additive authoring surfaces, fetched/shared packages are stored once and enabled through bindings, and the directory or package id must match frontmatter `name`.

## Locations

At runtime, inside a Shrimpy workspace, Shrimpy recognizes four skill sources:

```text
src/setup/templates/skills/<id>/SKILL.md                    source default for all agents
src/setup/templates/mechanic/skills/<id>/SKILL.md           source default for mechanic
skills/<id>/SKILL.md                                       workspace-authored skill
agents/<agent-id>/skills/<id>/SKILL.md                     agent-authored skill
state/skills/packages/<id>/SKILL.md                        fetched/shared package
state/skills/packages.json and bindings.json               package provenance and visibility
```

Agent-authored skills win over workspace-authored skills, package bindings, and source defaults with the same Shrimpy id. Workspace-authored skills win over package bindings and source defaults. Nested ids are allowed, for example `skills/web/fetch/SKILL.md`, but ids are normalized and must not contain absolute paths, `..`, backslashes, `~`, `:`, or empty segments.

Default setup no longer copies unchanged Shrimpy default skills into the workspace. Broad habits such as `memory-management`, `journal-daily`, and `journal-compact` are source defaults available to all compatible agents. Maintenance capabilities such as `mechanic`, `add-agent`, `channel-routing`, `watches`, `workspace-migration`, `setup`, and `shrimpy-mechanic-ideas` are source defaults visible only to the `mechanic` agent. A user or agent can still add local files under `skills/` or `agents/<id>/skills/` to customize or add capabilities.

## Bundle Shape

`SKILL.md` is the standard Agent Skills entrypoint. It must contain Pi-compatible YAML frontmatter:

```markdown
---
name: memory-management
description: Use for periodic memory upkeep and workspace context hygiene.
---

# Memory Management

Instructions for when and how to use this skill.
```

The public Shrimpy id is the directory id, while Pi's slash command name comes from frontmatter `name`. They must match so `shrimpy --skill <id>`, watches, and `/skill:<name>` all point at the same name. If they differ, `shrimpy skills validate` fails.

Optional bundle directories:

```text
scripts/      small helper scripts the skill may ask the model to run
references/   supporting docs or examples
assets/       files, media, templates, or other inputs
```

Skill instructions should reference those files relative to the skill root. Pi's prompt tells the model to resolve relative paths against the `SKILL.md` directory before using tools.

Shrimpy relies on Pi for Agent Skills parsing, validation diagnostics, and runtime behavior. `name`, `description`, and `disable-model-invocation` affect Shrimpy sessions. Shrimpy also reads `allowed-tools` as a compatibility declaration: if a skill names tools the current agent does not have active, the skill remains inspectable but is not advertised to Pi for that agent.

## Loading Model

Shrimpy resolves the effective skill entries for the active agent, applies tool compatibility gates, then passes only compatible winning `SKILL.md` paths to Pi. Pi's ambient skill discovery remains disabled, so cwd-local `.pi/skills`, `.agents/skills`, global Pi user skills, and settings-installed skills do not silently enter Shrimpy sessions.

Pi owns skill parsing, validation diagnostics, the `<available_skills>` prompt block, `/skill:<name>` expansion, autocomplete, and RPC command discovery. Shrimpy adds policy around source defaults, workspace/agent scope, package bindings, safe paths, id precedence, inspection, local file management, provenance, and tool compatibility.

At session start, Pi advertises visible skills by name, description, and location. Full `SKILL.md` content is loaded only when the user preloads a skill with `--skill <id>`, a watch names a skill, the model reads the skill file, or the user invokes `/skill:<name>`. Skills with `disable-model-invocation: true` are not shown in Pi's prompt block, but can still be invoked explicitly.

If more than 20 visible compatible skills are effective for an agent, Shrimpy reports a warning through `shrimpy skills list` and `shrimpy skills validate`; it does not automatically rank or summarize skills beyond tool compatibility gating.

## CLI

```bash
shrimpy skills list [--agent <id>] [--json]
shrimpy skills show <id> [--agent <id>]
shrimpy skills add <source> [--agent <id>|--workspace] [--id <id>] [--force]
shrimpy skills new <id> [--agent <id>|--workspace] [--description <text>] [--force]
shrimpy skills validate [id] [--agent <id>] [--json]
```

`add` fetches or copies a skill package into `state/skills/packages/`, records provenance in `state/skills/packages.json`, and creates an agent or workspace binding in `state/skills/bindings.json`. Local paths and direct `http(s)` `SKILL.md` URLs are supported. `new` scaffolds a local bundle under `skills/` or `agents/<id>/skills/`. Both commands refuse replacement unless `--force` is present.
