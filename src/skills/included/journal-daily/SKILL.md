---
name: journal-daily
description: |
  End-of-day journal entry. Write a short vault journal note for today if
  activity warrants it, then keep only a tiny breadcrumb summary in context.
---

# Daily Journal

Invoked by my default end-of-day upkeep watch. Full journal entries live in `vault/journal/`, not `context/`. The only prompt-loaded journal file should be a tiny `context/journal.md` index with summary breadcrumbs.

## Outputs

- Full note: `vault/journal/days/<today>.md`
- Always-loaded breadcrumb: `context/journal.md`

`context/journal.md` is prompt budget. Keep it extremely short: recent high-signal bullets and paths to vault journal entries or summaries. Do not copy full journal text into context.

## What To Write

In the vault note, write a short paragraph or a few tight bullets about what happened today that I want my future self to remember. Written in my own voice. Think: what would I want to know in a week if someone asked "what did you work on last Tuesday?"

Examples of what belongs:
- Decisions made and why.
- Things I shipped.
- People I worked with on what.
- Surprises, blockers, things I'd do differently.

What doesn't belong:
- Verbatim transcripts.
- Every message I received.
- Trivial state changes ("acked 3 messages").

## Activity Gating

```bash
today="$(date +%Y-%m-%d)"
target="vault/journal/days/$today.md"
if [ -f "$target" ]; then
  echo "today already written, skipping"
  exit 0
fi

# look at today's activity across channels
since_ms="$(($(date -d 'today 00:00' +%s) * 1000))"
shrimpy channels --json \
  | jq -r --argjson since "$since_ms" \
      '.[] | select(.lastMessage and .lastMessage.timestamp > $since) | .channel' \
  | while read -r channel; do
      shrimpy channels read "$channel" --limit 20
    done
```

If nothing happened today, don't write a file. A missing day-note is fine.

## Context Breadcrumb

After writing the vault note, update `context/journal.md` with one compact line:

```markdown
- 2026-06-22: one short durable takeaway. Details: vault/journal/days/2026-06-22.md
```

Keep only enough lines to be useful in every session. Prefer 5-10 recent bullets plus links to compacted week/month summaries. If the file grows, prune or replace older daily bullets with a path to the compacted summary.

## Hard Rules

- The vault filename is today's date. Don't backfill. Don't overwrite.
- Do not write full journal entries under `context/`.
- If you write `vault/journal/days/<today>.md`, also update `context/journal.md` with a small summary and path breadcrumb.
- If yesterday's file is missing, it's missing.
