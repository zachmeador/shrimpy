# 🦐 MEM-001: Session Title Summarizer

Status: draft
Priority: P3
Area: Memory
Depends On: [TUI-004](../tui-004-agent-session-navigator.md)

## Why

Generated session titles might make old sessions easier to scan, but Pi already persists user-facing session names and a first-prompt preview may be sufficient for the initial navigator. This should wait until TUI-004 provides evidence that automatic titles solve a real ambiguity.

## Current State

- Pi persists session names through `session_info`, exposes naming in the TUI, and already uses the name in resume and title surfaces.
- Shrimpy's session inventory can read Pi session names and derive a first-prompt preview without creating parallel title metadata.
- There is no demonstrated need yet for background model calls over active and archived sessions.

## Build

- Validate the need from the TUI-004 navigator before adding generation or scheduling.
- If needed, generate a short name only for sessions without a user-provided Pi session name. Target roughly 60–80 characters so it remains useful in selectors and terminal tabs.
- Write the generated value through Pi's existing session-name mechanism so every Pi and Shrimpy surface has one canonical display name.
- If generation provenance is necessary, store only narrow Shrimpy metadata such as source digest, generated timestamp, and model id; do not create a second canonical title field.
- Strip tool results, file contents, command logs, credentials, screenshots, and media payloads from any summarization request.
- Start with an explicit CLI refresh path or one bounded post-session trigger. Do not schedule background refreshes across every active and archived session until usage proves that worthwhile.
- Use an explicit cheap summarization model policy and avoid reprocessing unchanged inputs.

## Boundaries

- Do not overwrite a user-provided Pi session name.
- Do not treat a generated name as long-term memory or load it into prompts.
- Do not create a second session registry or parallel canonical title entry.
- Do not make TUI navigation depend on generation succeeding.
- Do not automatically spend model tokens across archived sessions without an explicit user-visible workflow.

## Done

- TUI-004 usage demonstrates that first-prompt previews and manual Pi names are insufficient.
- Generated names are short, omit sensitive/tool payloads, and use an explicit low-cost model policy.
- Sessions retain one canonical Pi session name, with user-provided names taking precedence.
- Generation is inspectable, bounded, and skips unchanged input.
- CLI and TUI inventory display the same resulting name.
