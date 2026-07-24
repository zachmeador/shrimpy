# 🦐 Skills

Agent Skills are Markdown instruction sets. Shrimpy adds trails for the visible skills to the agent's context — name, description, and file location — and Pi loads the selected skill text from those trails when requested. Workflow execution, action choice, and scheduling live in sessions, tools, watches, and CLI commands. (Repository developer skills under this repo's root `skills/` are a separate source-tree concern; see [development.md](development.md).)

Shrimpy follows the [Agent Skills specification](https://agentskills.io/specification) through Pi's skill loader and prompt renderer. Shrimpy adds local policy on top: included Shrimpy packages have source in the app checkout, package installs copy into visible workspace or agent `skills/` roots, those roots remain additive authoring surfaces, and the directory or package id must match frontmatter `name`.

## Locations

At runtime, inside a Shrimpy workspace, Shrimpy recognizes these skill sources:

```text
src/skills/included/<id>/SKILL.md                          included Shrimpy package source
skills/<id>/SKILL.md                                       workspace-owned skill or installed package copy
agents/<agent-id>/skills/<id>/SKILL.md                     agent-owned skill or installed package copy
state/skills/packages.json                                 package provenance, assignment, and drift tracking
```

Agent-owned skills win over workspace-owned skills with the same Shrimpy id. Installed package assignments are real files in the agent or workspace skill root, so they follow the same precedence as any other local skill. Nested ids are allowed, for example `skills/web/fetch/SKILL.md`, but ids are normalized and must not contain absolute paths, `..`, backslashes, `~`, `:`, or empty segments.

Fresh setup copies assigned included packages into visible skill roots and records provenance in `state/skills/packages.json`. User-added included, local, URL, and GitHub packages use the same visible-copy install model. Workspace-level assignments are `shrimpy-coding-delegation`, `memory-management`, `remember`, `shrimpy-search`, `journal-daily`, `journal-compact`, `shrimpy-agents`, `shrimpy-channels`, `shrimpy-watches`, and `shrimpy-skills`. Mechanic agent assignments are `shrimpy-setup`, `shrimpy-workspace-migration`, `shrimpy-security-audit`, and `shrimpy-hygiene-audit`. `codex-web-search` is included in source but not assigned by default. A user or agent can still add local files under `skills/` or `agents/<id>/skills/` to customize or add capabilities.

## Skill Directory Shape

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

Optional skill directories:

```text
scripts/      small helper scripts the skill may ask the model to run
references/   supporting docs or examples
assets/       files, media, templates, or other inputs
```

Skill instructions should reference those files relative to the skill root. Pi's prompt tells the model to resolve relative paths against the `SKILL.md` directory before using tools.

Shrimpy-authored skills should guide agent behavior and point to durable docs wherever possible. Keep feature facts, command catalogs, schemas, and long examples in the owning reference docs; keep `SKILL.md` focused on trigger scope, workflow choices, safety boundaries, validation, and the few commands an agent must sequence correctly.

Shrimpy relies on Pi for Agent Skills parsing, validation diagnostics, and runtime behavior. `name`, `description`, and `disable-model-invocation` affect Shrimpy sessions. Shrimpy also reads `allowed-tools` as a compatibility declaration: if a skill names tools the current agent does not have active, the skill remains inspectable but is not advertised to Pi for that agent.

## Loading Model

Shrimpy resolves the effective skill entries for the active agent, applies tool compatibility gates, then passes only compatible winning `SKILL.md` paths to Pi. Pi's ambient skill discovery remains disabled, so cwd-local `.pi/skills`, `.agents/skills`, global Pi user skills, and settings-installed skills do not silently enter Shrimpy sessions.

Pi owns skill parsing, validation diagnostics, the `<available_skills>` prompt block, `/skill:<name>` expansion, autocomplete, and RPC command discovery. Shrimpy adds policy around packages, workspace/agent scope, safe paths, id precedence, inspection, local file management, provenance, drift detection, and tool compatibility.

At session start, Pi advertises visible skills by name, description, and location. Full `SKILL.md` content is loaded only when the user preloads a skill with `--skill <id>`, a watch names a skill, the model reads the skill file, or the user invokes `/skill:<name>`. Skills with `disable-model-invocation: true` are not shown in Pi's prompt block, but can still be invoked explicitly.

If more than 20 visible compatible skills are effective for an agent, Shrimpy reports a warning through `shrimpy skills list` and `shrimpy skills validate`; it does not automatically rank or summarize skills beyond tool compatibility gating.

## CLI

```bash
shrimpy skills list [--agent <id>] [--json]
shrimpy skills show <id> [--agent <id>]
shrimpy skills add <source> [--agent <id>|--workspace] [--path <path>] [--ref <ref>] [--all] [--dry-run] [--force] [--json]
shrimpy skills update <id> [--agent <id>|--workspace] [--dry-run] [--json]
shrimpy skills remove <id> [--agent <id>|--workspace] [--json]
shrimpy skills new <id> [--agent <id>|--workspace] [--description <text>] [--force]
shrimpy skills validate [id] [--agent <id>] [--json]
```

`add` accepts included Shrimpy packages with `included:<id>`, local directories, local `SKILL.md` files, direct `http(s)` `SKILL.md` URLs, and GitHub specs such as `owner/repo`, `owner/repo@main`, `owner/repo/path/to/skill`, `owner/repo@v1.0.0/path/to/skill`, and `https://github.com/owner/repo/tree/main/skills/foo`. Every package source copies into `skills/<id>/` or `agents/<id>/skills/<id>/`, using the package's Pi skill name as the id, and records source hash, installed path, assignment, installed hash, and modified status in `state/skills/packages.json`. Package records are keyed by install target, such as `workspace:<id>` or `agent:<agent-id>:<id>`, so the same skill id can be installed separately for multiple owners. If a GitHub repository contains multiple skill package candidates, non-interactive add fails unless `--path` selects one or `--all` selects every discovered package. `--dry-run` reports candidates and selected candidates without writing package state or skill files.

GitHub-backed packages record owner, repo, path, requested ref, resolved ref, resolved commit SHA, source revision, and source revision kind. For subdirectory skills, the source revision is the Git tree SHA for that directory. For root-level skills, it is the `SKILL.md` blob SHA. Local, included, and direct-URL packages use a package content hash. `shrimpy skills update <id>` rechecks the recorded source, reports update availability with `--dry-run`, and replaces only the managed installed copy when an update is applied. If more than one install has the same id, pass `--agent <id>` or `--workspace`. Package updates refuse to overwrite a locally modified installed copy without an explicit review decision. `shrimpy skills remove <id>` removes one managed installed copy and its package record, with the same target selection rule.

Managed package install/update never executes package scripts. Local directory package copies skip symlinks, hidden entries, and `node_modules`. `new` scaffolds a local skill under `skills/` or `agents/<id>/skills/`; manually placed skills in those roots remain additive and are not converted into managed packages unless the user explicitly installs a package. `add` and `new` refuse replacement unless `--force` is present.
