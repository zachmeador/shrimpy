---
name: journal-daily
description: |
  End-of-day journal entry. Write a short paragraph for today if activity
  warrants it. No backfilling, no rewriting old days.
---

# Daily Journal

Invoked by my scheduled upkeep at end-of-day. Produces at most one file:
`context/journal/days/<today>.md`.

## What to write

A short paragraph (a few sentences, not a transcript) about what happened
today that I want my future self to remember. Written in my own voice. Think:
what would I want to know in a week if someone asked "what did you work on
last Tuesday?"

Examples of what belongs:
- Decisions made and why.
- Things I shipped.
- People I worked with on what.
- Surprises, blockers, things I'd do differently.

What doesn't belong:
- Verbatim transcripts.
- Every message I received.
- Trivial state changes ("acked 3 messages").

## Activity gating

```bash
today="$(date +%Y-%m-%d)"
target="context/journal/days/$today.md"
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
      shrimpy channels read "$channel" --limit 50 --json
    done
```

If nothing happened today, don't write a file. A missing day-note is fine.

## Hard rule

The filename is today's date. Don't backfill. Don't overwrite. If yesterday's
file is missing, it's missing.
