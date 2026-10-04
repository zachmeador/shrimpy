---
name: shrimpy-security-audit
description: Use when reviewing Shrimpy workspace security posture, tool surfaces, automations, dependency risk, or exposed channels without changing anything.
---

# Security Audit

Use this mechanic-owned skill for a read-only security posture review of Shrimpy state and systems Shrimpy maintains. Produce evidence and recommendations; do not fix, disable, update, delete, rotate, migrate, or rewrite anything during the audit.

## Output

Write one dated Markdown report under `agents/mechanic/vault/audits/`, for example `agents/mechanic/vault/audits/2026-06-11-security.md`.

Use this shape:

- scope and sources inspected;
- changes since the prior security audit, if a prior report exists;
- findings with evidence paths, commands, dates, and risk;
- recommended next action for each finding, stating whether it needs explicit user approval;
- checked, found nothing for clean areas;
- unresolved questions and skipped areas.

Reply with the report path and a short TLDR of the highest-priority findings. If running from a user-scheduled watch, send a channel message only when there are findings or an actionable failure. If clean, write the report and leave the quiet no-op in watch history.

## Inspect

Stay inside the Shrimpy workspace and declared Shrimpy-managed systems unless the user grants more scope. Start with normal CLI surfaces and file evidence:

```bash
shrimpy status
shrimpy agent list
shrimpy skills validate --agent mechanic
shrimpy channels
shrimpy surface
shrimpy watches --agent shrimpy
shrimpy watches --agent mechanic
find config agents skills state runtime channels media -maxdepth 4 -type f | sort | head -240
```

Record unknowns when a command, permission, path, or tool is missing. If a needed signal has no CLI path, note a small CLI gap instead of adding audit-only runtime behavior.

## Review Areas

Check Shrimpy-maintained state and generated work:

- agent tool policy, disabled tools, active tools, and unusually broad access;
- externally reachable surfaces, channel bindings, channel members, and wake policy;
- command watches, message watches, recurrence, emit policy, and watch-owned shell commands;
- skill and prompt automation language, especially destructive defaults, unapproved persistence, secret handling, shell injection, and network egress;
- generated scripts and apps under agent projects or Shrimpy-managed project folders;
- package manifests and lockfiles for install scripts, weak pinning, unusual dependency sources, and dependencies published under seven days ago when package metadata is available;
- local service definitions Shrimpy created, such as cron entries, LaunchAgents, systemd units, and dev-server scripts;
- auth and model config metadata without printing secrets.

For secrets, report only file path, key name, provider family, presence, and exposure risk. Do not print tokens, keys, cookies, session contents, or private message bodies.

## Boundaries

- Recommend only. Ask for explicit approval before any fix, disablement, deletion, credential rotation, package update, or migration.
- Do not crawl personal directories beyond the workspace and declared managed systems.
- Do not create bundled watches or hidden audit daemons.
- Do not treat every unusual setup as wrong; explain likely risk and point at better owners.
- Do not use raw logs as durable prompt material. Summarize evidence into the report with source pointers.
