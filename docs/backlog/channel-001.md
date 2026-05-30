# 🦐 CHANNEL-001: Richer Channel Inspection

Status: todo
Priority: P1
Area: Channels

## Why
Channel logs are append-only and reliable, but users and agents need better ways to search, summarize, and understand recent requests or open threads without reading raw JSONL files.

## Build
- Add richer channel inspection, search, and summary commands.
- Surface recent requests, open threads, and maintenance logs.
- Keep append-only logs as the source of truth.

## Boundaries
- Do not mutate channel history to support summaries.
- Do not add a database unless JSONL access becomes the concrete constraint.

## Notes
- Likely files: `src/commands/channels.ts`, `src/channels/service.ts`, `src/channels/bus.ts`, and `src/web/read.ts`.
- Output should be agent-friendly and easy to compose from the CLI.

## Done
- `shrimpy channels` exposes the richer inspection paths.
- Agents can follow briefing pointers without manual raw-file reads.
- Tests cover search/filter behavior and summary bounds.
