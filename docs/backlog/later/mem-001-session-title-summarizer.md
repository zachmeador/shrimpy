# MEM-001: Session Title Summarizer

Status: todo
Priority: P3
Area: Memory
Depends On: [MODEL-001](../model-001-user-configurable-model-policy.md), [TUI-004](../tui-004-agent-session-navigator.md)

## Why

Long-running Shrimpy sessions are hard to recognize from channel/session labels
alone. Shrimpy should maintain a compact generated title for each session so
agents and humans can identify prior work quickly from the CLI and future
session navigation surfaces.

This is low priority. It should wait until the upstream model-policy and
session-inventory shapes are clearer.

## Current State

- `shrimpy sessions list [channel] --agent <id> --json` lists active sessions
  and recent archives for one agent, but it does not include generated titles.
- Session metadata records runtime/model/compaction facts and lifecycle state;
  there is no `shrimpy_session_title` custom entry or sidecar title index.
- Model-policy support for choosing a cheap summarization model does not exist
  yet.

## Build

- Add an efficient session-title summarizer that produces a title of 140
  characters or less.
- Strip tool results before summarization. Keep only the minimum useful shape:
  roles, user-visible text, assistant-visible text, tool names, timestamps when
  relevant, and short error/status hints.
- Avoid re-summarizing unchanged sessions. Track a digest, message count, or
  newest entry id so title refreshes only when the summarized input changed
  meaningfully.
- Use the same provider path and inference handling as Shrimpy compaction, but
  resolve a cheap/fast summarization model through model policy once that exists.
- Persist the title as Shrimpy-owned session metadata, for example a
  `shrimpy_session_title` custom session entry or an equivalent inspectable
  sidecar index. The record should include title, source digest/newest entry,
  generated timestamp, and model metadata.
- Expose titles through existing CLI inspection:
  - `shrimpy sessions list [channel] [--agent <id>] [--json]` includes title
    when present.
  - richer agent/session inventory commands from [TUI-004](../tui-004-agent-session-navigator.md)
    include title when present.
- Refresh the title after session activity at a bounded cadence, or through
  normal maintenance/session-inventory work if an explicit refresh path is later
  needed.
- Include active and archived sessions so old work remains discoverable.

## Boundaries

- Do not treat the generated title as long-term memory or load it into prompts by
  default. It is discoverability metadata for sessions.
- Do not mutate channel logs or rewrite existing session transcript entries.
- Do not send raw tool outputs, file contents, command logs, credentials,
  screenshots, or binary/media payloads to the title summarizer.
- Do not create a second session registry. Titles should attach to existing
  session storage and listing flows.
- Do not make TUI navigation depend on title generation succeeding.

## Touches

- [TUI-004](../tui-004-agent-session-navigator.md): the navigator wants richer
  session metadata and should display these titles when available.
- [CODE-002](../code-002-agentic-worker-sessions.md): worker sessions already
  need compact summaries; this title generator should share token-stripping and
  cheap summarization helpers where useful, while keeping worker Markdown
  summaries separate from 140-character session titles.
- [MODEL-001](../model-001-user-configurable-model-policy.md): title generation
  should use an explicit low-cost summarization/model-policy intent instead of
  silently spending the active session's main model.
- [Compaction](../../reference/compaction.md): title summarization should reuse
  provider/request plumbing where practical, but it is not compaction and should
  not affect working context.
- [Memory](../../reference/memory.md): titles help locate session evidence for
  memory upkeep, but they are not durable memory files.

## Done

- Session titles are generated at 140 characters or less from stripped,
  token-efficient inputs.
- Tool result bodies are excluded from title prompts.
- Titles are persisted as inspectable Shrimpy session metadata.
- `shrimpy sessions list` shows titles in human and JSON output.
- Existing compaction, memory upkeep, and worker-session summaries remain
  separate concepts.
