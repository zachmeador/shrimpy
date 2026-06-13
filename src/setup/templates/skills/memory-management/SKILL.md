---
name: memory-management
description: |
  Periodic upkeep of my own context/ directory. Run when my watch fires; gate on
  activity, write in my own voice, prune as I go.
---

# Memory Management

This skill is invoked by my default upkeep watch. The job is to look at recent
activity, decide if anything durable is worth recording, and update my own
context files. If nothing's durable, do nothing.

## What lives where

- top-level `context/*.md` files — always loaded into every session. Stable
  working knowledge, active references, and durable memory about how I work.
  Create them only when there is something real to preserve.
- `context/people/<actor-id>.md` — per-peer notes, loaded only when that peer
  is the active sender.
- `context/channels/<name>.md` — per-channel notes, loaded only when that
  channel is active.
- `context/journal/` — handled by `journal-daily` and `journal-compact`, not
  this skill.
- `profile/*.md` (workspace-level) — shared, not mine. Ask the user before
  touching.

## Activity gating

Don't re-process entities that haven't seen activity since the matching file's
mtime. Bash recipes:

```bash
# peer notes with messages newer than the matching context file
for f in context/people/*.md; do
  [ -f "$f" ] || continue
  peer="$(basename "$f" .md)"
  since_ms="$(($(stat -c %Y "$f") * 1000))"
  shrimpy channels --json \
    | jq -r '.[] | select(.exists and .path) | [.channel, .path] | @tsv' \
    | while IFS=$'\t' read -r channel path; do
        jq -c --arg peer "$peer" --argjson since "$since_ms" \
          'select(.timestamp > $since and .sender.actorId == $peer)' "$path" \
          | sed "s/^/[$channel] /"
      done
done

# channel notes with messages newer than the matching context file
for f in context/channels/*.md; do
  [ -f "$f" ] || continue
  channel="$(basename "$f" .md)"
  since_ms="$(($(stat -c %Y "$f") * 1000))"
  path="$(shrimpy channels show "$channel" --json | jq -r '.path')"
  jq -c --argjson since "$since_ms" 'select(.timestamp > $since)' "$path"
done

# no framework cursor file is required here; use context file mtimes and
# explicit channel reads as the processing boundary
```

If no entity has activity since last touch, the whole run is a no-op.

## Writing

- Write in my own voice, like a note to my future self. Not a report. The
  agent's SOUL should leak through.
- Preserve evidence pointers when the detail matters (`evidence: shrimpy
  channels read home --after <msg-id>`).
- Prune as I go. Replace, don't accumulate. This is a working note, not a log.
- Avoid stale personality guesses, every-preference-ever, agent-bait taxonomy.
- Don't replay transcripts.

## Editing

I use my normal file edit tools (Read, Write, Edit) against files under
`context/`. No special memory tool — these are just markdown files in the
workspace.

To delete or replace a wrong note: open the file, edit, save. The change shows
up in git history if the workspace is a git repo.

## When in doubt

If nothing's worth writing, don't write. Sludge is worse than absence.
