# 🦐 MECH-002: Mechanic Audit Skills

Status: review
Priority: P1
Area: Mechanic
Depends On: none

## Why

Shrimpy should help the user notice risky changes and workspace mess without fixing anything behind their back. The mechanic already owns setup and repair; audits are the same job in read-only form. Give the mechanic two audit skills that share one shape: run in a normal mechanic session, write a dated Markdown report under the mechanic's vault, recommend without changing anything. Scheduling is a user choice through [SETUP-003](setup-003-opt-in-watch-seeding.md) or normal watch commands, never a default.

This replaces the bundled security agent plan (SECURITY-002) and the mechanic assessment watch plan (MECH-001): one owner, two checklists, one report shape.

## Current State

- The bundled `mechanic` agent exists with seven mechanic-bound skills in `src/skills/defaults.ts`; none cover audits.
- Watch primitives exist (`shrimpy watches add/list/show/history/run`), so a user can already schedule any skill-driven check.
- The agent-report convention `agents/<id>/vault/<kind>/` is documented in [workspace.md](../reference/workspace.md).
- [security.md](../reference/security.md) documents current security behavior only; there is no audit loop.

## Build

- Add two mechanic-bound source-default skills under `src/setup/templates/mechanic/skills/`, registered in `src/skills/defaults.ts`:
  - `security-audit` — posture review of Shrimpy state and anything Shrimpy maintains: agent tool policy, externally reachable surfaces and channel policies, wake policy, command watches, skill and prompt automation language, generated scripts and apps (destructive defaults, secret handling, shell injection, network egress), package manifests and lockfiles (dependencies published under seven days old, install scripts, weak pinning), local service definitions Shrimpy created (cron, LaunchAgents, systemd units, dev-server scripts), and auth/model config metadata without printing secrets. Record unknowns explicitly when scope or tool access is missing.
  - `hygiene-audit` — janitor pass backed by mechanical evidence: failing or stale watches from run history, dead channels, context bloat (file sizes, duplicated blocks), `shrimpy skills validate` failures, mixed ownership such as one agent's identity living in shared profile files, uninspectable automation, and raw logs used as durable prompt material.
- Shared report contract: timestamped Markdown under `agents/mechanic/vault/audits/` (for example `2026-06-11-security.md`) containing scope and sources inspected, changes since the prior audit, findings with evidence paths/commands/dates, recommended next action and whether it needs explicit approval, an explicit "checked, found nothing" section for clean areas, and unresolved questions.
- Manual-first: each audit runs from an ordinary mechanic session, and the session reply is the report path plus a short TLDR of the highest-priority findings.
- When run from a user-scheduled watch, emit a channel message only on findings or actionable failure; otherwise record a quiet no-op in run history.
- Audits drive existing CLI inspection surfaces; when a needed signal has no CLI path, file that as its own small CLI gap instead of adding audit-only runtime code.

## Boundaries

- Audits recommend; they never fix, disable, update, delete, or migrate anything. Cleanup is separate, user-requested work.
- No bundled security agent, no audit daemon or hidden control plane, no telemetry; reports stay local workspace files.
- No seeded audit watches; recurrence exists only when the user schedules it.
- Do not crawl personal directories beyond the Shrimpy workspace and declared managed systems without explicitly granted scope.
- Not a linter: explain likely risk and point at better owners; unusual but intentional setups stay legal.
- Open-ended "what could you build" ideation is not audit material; pattern shapes belong to [SKILL-001](skill-001-pattern-reference-skill.md) and on-demand mechanic sessions. A hygiene report may include a short opportunity note only when tied to concrete observed repetition.

## Notes

- [SKILL-001](skill-001-pattern-reference-skill.md)'s audits pattern page points here once this ships.
- OS/runtime sandboxing remains [SECURITY-001](security-001-agent-sandboxing-security-strategy.md); the audits should be useful before any sandbox exists.
- The dependency-age check keeps a recorded-exception escape hatch (urgent security patch, internal package, user override).

## Done

- Both skills exist as mechanic source defaults, `shrimpy skills validate` passes, and directory ids match frontmatter names.
- A normal mechanic session can run each audit and produce a dated report under `agents/mechanic/vault/audits/` following the shared shape, including nothing-found coverage when clean.
- Audits change nothing; every recommended action states whether it needs explicit user approval.
- Either audit can be scheduled as an ordinary mechanic-owned watch with quiet no-op behavior, and nothing is scheduled by default.
- Tests cover skill seeding and validation, plus report-path helpers if any code is added.
