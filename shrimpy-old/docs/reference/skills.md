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

Fresh setup copies assigned included packages into visible skill roots and records provenance in `state/skills/packages.json`. User-added included, local, URL, and GitHub packages use the same visible-copy install model. Workspace-level assignments are `shrimpy-coding-delegation`, `memory-management`, `remember`, `shrimpy-search`, `journal-daily`, `journal-compact`, `shrimpy-agents`, `shrimpy-channels`, and `shrimpy-skills`. Mechanic agent assignments are `shrimpy-setup`, `shrimpy-update`, `shrimpy-watches`, `shrimpy-watches-default-init`, `shrimpy-security-audit`, and `shrimpy-hygiene-audit`. `codex-web-search` is included in source but not assigned by default. A user or agent can still add local files under `skills/` or `agents/<id>/skills/` to customize or add capabilities.

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

Use `shrimpy skills --help` and subcommand help for exact options. A typical package workflow is:

```bash
shrimpy skills list --agent shrimpy
shrimpy skills add included:codex-web-search --workspace --dry-run --json
shrimpy skills add included:codex-web-search --workspace
shrimpy skills validate --agent shrimpy
```

`add` accepts included packages, local directories or `SKILL.md` files, direct HTTP(S) skill URLs, and GitHub sources such as `owner/repo@ref/path`. It copies the package into the chosen workspace or agent root and records provenance in `state/skills/packages.json`. Use `--path` to choose among multiple candidates; `--all` explicitly selects them all. `--dry-run` inspects candidates without writing files or package state.

`update` rechecks the recorded source; `--dry-run` reports availability. Updates refuse to overwrite locally modified packages without review. `remove` deletes the selected managed copy and its record. When an ID is installed for several owners, select the target with `--agent` or `--workspace`.

`new` scaffolds an original local skill. Manually authored skills remain local files unless explicitly installed as packages. `add` and `new` refuse replacement without `--force`.

## Package Inspection

Package records identify the source, revision, installed location, and content drift per owner. GitHub sources retain their requested/resolved ref and commit; local and URL sources use content hashes. Use `skills list`, `show`, and `update --dry-run` before deciding whether to refresh a copy.

Validation checks structure, naming, paths, availability, and package state; it is not a security review. Review third-party instructions, scripts, references, and assets before exposing them to an agent. Install/update copies files without executing package scripts; local directory copies skip symlinks, hidden entries, and `node_modules`.
