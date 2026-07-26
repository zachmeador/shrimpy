---
name: shrimpy-watches-default-init
description: Use when the user wants to inspect, install, or enable Shrimpy's optional default recurring watches.
---

# Optional Default Watches

Use this skill when the user asks the mechanic to set up Shrimpy's standard recurring upkeep. These defaults are optional: do not create or enable any watch until the user selects it.

## Inspect First

Inspect existing watches before proposing changes:

```bash
shrimpy watches --agent shrimpy --json
shrimpy watches --agent mechanic --json
```

Preserve user-created watches. If a default id already exists, inspect it and ask before replacing its behavior; do not overwrite it.

## Default Set

All default watches run in `maintenance` and are created disabled. Explain the selected routines, their owner, and cadence before creating them:

| Id | Owner | Cadence | Purpose |
|---|---|---|---|
| `memory-management` | `shrimpy` | daily 03:00 | Review activity and preserve only warranted durable memory. |
| `journal-daily` | `shrimpy` | daily 22:30 | Record activity worth keeping in a short daily journal note. |
| `journal-compact` | `shrimpy` | Sundays 04:00 | Compact prompt-loaded journal breadcrumbs. |
| `security-audit` | `mechanic` | Mondays 05:00 | Write a read-only security posture report. |
| `hygiene-audit` | `mechanic` | Fridays 05:00 | Write a read-only workspace hygiene report. |

Create only the user-approved entries:

```bash
shrimpy watches add memory-management --agent shrimpy --cron "0 3 * * *" --channel maintenance --disabled --message "Use the \`memory-management\` skill. Review recent channel activity, update my own context files only when durable memory is warranted, and prune stale notes as I go. If there is nothing worth writing, report a no-op."
shrimpy watches add journal-daily --agent shrimpy --cron "30 22 * * *" --channel maintenance --disabled --message "Use the \`journal-daily\` skill. If today had activity worth remembering, write today's short vault journal note and update the tiny context breadcrumb. Do not backfill or overwrite prior days."
shrimpy watches add journal-compact --agent shrimpy --cron "0 4 * * 0" --channel maintenance --disabled --message "Use the \`journal-compact\` skill. Compact old prompt-loaded journal breadcrumbs according to the skill's date limits. Keep vault journal notes; prune only replaced lines in context/journal.md."
shrimpy watches add security-audit --agent mechanic --cron "0 5 * * 1" --channel maintenance --disabled --message "Use the \`shrimpy-security-audit\` skill. Run a read-only security posture review and write the report under agents/mechanic/vault/audits/. Do not change workspace state."
shrimpy watches add hygiene-audit --agent mechanic --cron "0 5 * * 5" --channel maintenance --disabled --message "Use the \`shrimpy-hygiene-audit\` skill. Run a read-only workspace hygiene review and write the report under agents/mechanic/vault/audits/. Do not change workspace state."
```

Enable only the entries the user explicitly wants to start:

```bash
shrimpy watches enable <agent-id>/<watch-id>
```

## Verify

For every created or changed watch, run:

```bash
shrimpy watches show <agent-id>/<watch-id> --json
```

Report which watches were installed, which are enabled, their cadence, and the execution channel. Remind the user that watches require a running gateway to fire.
