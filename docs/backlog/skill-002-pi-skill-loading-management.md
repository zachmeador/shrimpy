# 🦐 SKILL-002: Pi-Backed Skill Loading And Management

Status: done
Priority: P1
Area: Skills
Depends On: none

## Why

Shrimpy already seeds useful default skills and has workspace-level and
agent-level skill directories, but Shrimpy's current integration only partially
uses that model. Shrimpy can list skills and explicitly load selected skill
context with `--skill`, while the Pi resource loader is still configured with
`noSkills: true` and no Shrimpy skill paths.

That means Pi's built-in skill affordances and Shrimpy's advertised skills are
not yet one coherent system. As the default skill pack grows, users should be
able to add, inspect, and use skills at the workspace or agent level without
manual directory work or surprising differences between Shrimpy CLI output, TUI
status, scheduled runs, and Pi's interactive skill handling.

Research: [../research/pi-skill-handling.md](../research/pi-skill-handling.md).

## Direction

Unify the two skill layers by leaning on Pi where it is already modular:

- Shrimpy owns skill policy: which workspace and agent skill files are allowed
  in the active session, what wins when scopes collide, and what paths are safe.
- Pi owns skill mechanics: YAML frontmatter parsing, validation diagnostics,
  prompt formatting, `/skill:<name>` expansion, autocomplete, and RPC command
  discovery.

The first implementation should keep Pi's ambient skill discovery disabled but
pass Shrimpy-resolved skill entry files to Pi explicitly. In other words:
`noSkills: true` stays as the guardrail, while `additionalSkillPaths` carries the
winning `SKILL.md` files for the active agent. Use `skillsOverride` only if
explicit path loading cannot express Shrimpy's precedence or naming rules cleanly.

Assume workspace-level skills are intentionally curated. The first slice should
not add automatic top-k relevance filtering or a separate "installed but hidden"
visibility model. If an agent has too many effective skills, Shrimpy should
diagnose the prompt-size risk rather than trying to guess which skills matter.

## Build

- Define one Shrimpy skill resolution model for:
  - workspace skills at `skills/<id>/SKILL.md`;
  - agent skills at `agents/<id>/skills/<id>/SKILL.md`;
  - agent-level override precedence when an agent and workspace skill share an
    id;
  - nested skill ids, path normalization, and rejected unsafe ids;
  - visible collision/shadowing information for inspection.
- Feed only Shrimpy-approved winning `SKILL.md` entry paths into Pi's resource
  loading path so Pi's built-in skill commands can see the same skills Shrimpy
  advertises.
- Keep the existing guardrail that arbitrary cwd-local Pi skills, AGENTS files,
  and append prompts do not silently reshape a Shrimpy session.
- Use Pi `additionalSkillPaths` for the first slice. Keep `noSkills: true` so
  only the resolved Shrimpy path list is loaded by Pi.
- Remove the parallel Shrimpy skill mechanics where Pi can own them. Shrimpy
  should not keep a separate frontmatter parser, validator, or prompt formatter
  if Pi's exported APIs provide the behavior.
- Preserve Shrimpy's explicit prompt assembly behavior:
  - available skills are advertised from Pi's loaded skill list or from an
    exactly equivalent preview;
  - `shrimpy --skill <id>` and `shrimpy run --skill <id>` load full skill
    context;
  - scheduled runs that name a skill load that skill in the same way;
  - Pi's interactive skill handling does not expose a different skill universe.
- Add a soft diagnostic threshold for large effective skill sets, initially
  around 20 visible skills. Surface this through `shrimpy skills list`,
  `shrimpy doctor` when available, or another inspection path. This is a warning,
  not an automatic filter.
- Decide and document the public identifier rule. Prefer `skills/<id>/` matching
  frontmatter `name` so `shrimpy --skill <id>`, schedules, and `/skill:<name>`
  are predictable. If they differ, `shrimpy skills validate` should fail.
- Extend `shrimpy skills` with CLI-first management:
  - `shrimpy skills list [--agent <id>] [--json]` is backed by the same Pi-loaded
    skill view enriched with Shrimpy id, scope, source path, description, and
    shadowed/collision metadata;
  - `shrimpy skills show <id> [--agent <id>]` keeps printing `SKILL.md`;
  - `shrimpy skills add <id> [--agent <id>|--workspace] [--description <text>]`
    scaffolds a valid local skill bundle;
  - `shrimpy skills install <source> [--agent <id>|--workspace] [--id <id>]`
    copies an inspectable local skill bundle into the requested scope;
  - `shrimpy skills validate [id] [--agent <id>] [--json]` checks skill shape,
    entrypoint presence, unsafe paths, and script/resource layout.
- Keep overwrite behavior conservative. Refuse to replace an existing skill
  unless the user passes an explicit force flag, and report the target path.
- Document the supported skill bundle shape, including optional `scripts/`,
  resources, and how skills should reference files relative to their root.
- Make setup/default skills use the same conventions and validation rules as
  user-created skills.
- Update TUI `/status skills` and settings text so they describe the effective
  Shrimpy/Pi skill state rather than only Shrimpy's prompt-time advertisement.

## Boundaries

- Do not re-enable ambient Pi discovery for arbitrary cwd-local skills by
  default.
- Do not turn skills into a second control plane. They remain prompt/resources
  for sessions; CLI commands are for inspection and file management.
- Do not auto-invoke skills behind the user's back. Agents may choose skills
  from advertised context, and users/schedules may preload skills explicitly.
- Do not implement automatic relevance ranking, top-k skill selection, or
  hidden-by-default installed skills in the first slice.
- Do not migrate or overwrite existing workspace or agent skills without an
  explicit user action.
- Do not add a remote marketplace or package manager in this slice. Local
  install/copy support is enough for the first management path.

## Done

- Pi's built-in skill handling can list and load the same workspace and
  agent-level skills that `shrimpy skills list` reports.
- Normal Shrimpy sessions pass the active agent's resolved skills to Pi through
  explicit path loading while keeping ambient Pi skill discovery disabled.
- Shrimpy still blocks unrelated cwd-local Pi skill discovery unless the user
  explicitly installs a skill into the workspace or agent.
- Shrimpy uses Pi's skill parsing/validation/prompt mechanics instead of
  maintaining a divergent skill implementation.
- A user can scaffold a workspace or agent skill from the CLI without manually
  creating directories.
- A user can install a local skill bundle into the workspace or an agent with an
  inspectable, non-destructive command.
- `--skill`, scheduled skill runs, TUI skill affordances, and available-skill
  prompt advertising all use the same resolution rules.
- Large effective skill sets produce an inspectable warning, but Shrimpy does
  not silently drop skills from Pi's advertised list in this slice.
- Tests cover skill resolution precedence, Pi loader inputs, CLI scaffolding,
  install refusal/force behavior, validation failures, large-skill-set warnings,
  and prompt assembly.
