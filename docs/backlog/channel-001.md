# 🦐 CHANNEL-001: Richer Channel Inspection

Status: todo
Priority: P1
Area: Channels

## Why
Channel logs are append-only and reliable, but users and agents need better ways to search, summarize, and understand recent requests or open threads without reading raw JSONL files.

## Build
- Add richer channel inspection, search, and summary commands.
- Surface recent requests, open threads, and maintenance logs.
- Surface schedule/worker-originated messages in channels clearly enough to
  answer "why did this agent handle the message?", "which channel carried the
  message?", and "which source record caused it?" without reading raw JSONL.
- Add filters for message content/source kinds that matter to agents, including
  user text, scheduler messages, worker-related messages, and system messages.
- Keep append-only logs as the source of truth.

## Progress
- `shrimpy channels`, `shrimpy channels show <name>`, `shrimpy channels read <name> --limit N`, and `shrimpy channels tail <name>` provide basic list, summary, recent-read, and follow behavior.
- Channel inspection includes membership and last-message summaries, and JSON output is available for agent use.
- Remaining work is search/filtering, open-thread/request summaries, and richer maintenance-log views.

## Boundaries
- Do not mutate channel history to support summaries.
- Do not add a database unless JSONL access becomes the concrete constraint.

## Notes
- Likely files: `src/commands/channels.ts`, `src/channels/service.ts`, `src/channels/bus.ts`, and `src/web/read.ts`.
- Output should be agent-friendly and easy to compose from the CLI.
- Related: [CHANNEL-002](channel-002-attention-routed-channel-events.md) defines
  the routing contract this inspection work should make legible.

## Done
- `shrimpy channels` exposes the richer inspection paths.
- Agents can follow turn context pointers without manual raw-file reads.
- Schedule/worker-originated messages can be found, filtered, and traced
  back to their source records from channel inspection output.
- Tests cover search/filter behavior and summary bounds.
