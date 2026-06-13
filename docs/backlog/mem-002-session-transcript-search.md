# 🦐 MEM-002: Session Transcript Search

Status: todo
Priority: P2
Area: Memory
Depends On: none

## Why

Shrimpy's memory stance says durable memory stays small and high-signal while raw transcripts remain the evidence layer. Agents can already mine that layer today — they have bash and do grep session JSONL when they need past work — but the move is ad hoc: it requires knowing the storage layout, wading through raw JSON lines with embedded tool-result payloads, and rediscovering the same incantations each time. "Where did we discuss X?" should be a simple, always-available primitive with bounded output, not a bash exercise. When recall is awkward, the temptation is to stuff completed-work facts into memory files just so they stay findable.

The Hermes survey ([hermes-memory-survey-2026-05-21.md](../research/hermes-memory-survey-2026-05-21.md)) showed the working pattern: a deterministic session-search path for past work (decisions, commands, paths, PR numbers, old task state) removes most of the pressure to turn everything into memory facts, and Hermes' own memory guidance points the agent at session search instead of memory writes for anything likely to go stale. Shrimpy should have the same pressure-relief valve: cheap, local, no LLM, searchable transcripts. This does more for continuity than richer memory inference, and it should exist before any heavier memory upkeep work.

## Current State

- Session transcripts are Pi JSONL files under `agents/<id>/sessions/`, with active/archived lifecycle state tracked by `shrimpy_lifecycle` custom entries (`src/sessions/storage.ts`).
- `shrimpy sessions list [channel] --agent <id> [--json]` summarizes active sessions and recent archives for one agent (`summarizeAgentSessions` in `src/sessions/service.ts`), but there is no first-class transcript search; agents fall back to grepping the JSONL by hand.
- Channel logs already have content search through `searchChannelMessages` and `shrimpy channels search`; agent session transcripts — where the actual working conversations live — have no equivalent.
- [MEM-001](later/mem-001-session-title-summarizer.md) covers generated session titles and [TUI-004](tui-004-agent-session-navigator.md) plans an all-agent session inventory service. Neither searches content, and this item must not wait on them.

## Build

- Add CLI coverage first: `shrimpy sessions search <query> [--agent <id>] [--channel <channel>] [--all-agents] [--limit <n>] [--json]`.
- Search active and archived sessions by default, newest matches first, with a conservative default result limit.
- Match against user text, assistant text, and tool names. Exclude tool-result bodies from matching and snippets by default; add an explicit opt-in flag if raw tool output search proves necessary.
- Return enough metadata to act on a match without replaying whole files: agent id, session name/path, lifecycle state, session type/channel when known, entry timestamp, role, and a bounded snippet around the match.
- Add an anchored read path so a match can be expanded in place, for example `shrimpy sessions read <session> --around <entry> [--window <n>]`, instead of forcing a full-file dump.
- Implement as a streaming scan over session JSONL with case-insensitive matching. No index in the first slice; home-workspace transcript volumes should scan fine. Keep the search behind one service function so a derived index/cache can be added later if scanning gets slow.
- Reuse existing session summary/metadata reading from `src/sessions/service.ts` where practical so search, listing, and the future TUI-004 inventory agree on session facts.
- Add a daemon tool mirroring the CLI only after the CLI behavior is stable, with bounded structured output, so agents can recall past work before writing memory facts.

## Boundaries

- No LLM calls, embeddings, vector stores, or external services. This is deterministic text search over local files.
- No required index or database in the first slice. If an index is ever added, it is a rebuildable cache under `runtime/`, never the product shape of session history.
- Do not load search results into prompts or turn context by default. This is an on-demand recall tool, not ambient memory.
- Do not mutate transcripts, rewrite entries, or create a second session registry or format.
- Do not emit full tool-result bodies, secrets, or unbounded snippets in output. Everything returned is truncated and source-pointed.
- Do not duplicate channel search. Channel logs keep `shrimpy channels search`; keep filter and output vocabulary roughly aligned so the two feel like one family.
- Do not block on MEM-001 titles or TUI-004 inventory work. Titles enrich results when present; they are not required.

## Notes

- Design pressure: [memory-design.md](../musings/memory-design.md) separates evidence (transcripts, logs) from memory (small durable notes); this item is the evidence retrieval path that makes that separation livable.
- The adoption bar is the existing behavior: agents already grep session files from bash, so the command has to beat that workflow on simplicity and context cost (bounded snippets and pointers instead of raw JSONL lines) or agents will keep using grep.
- Hermes' `session_search` is SQLite/FTS5-backed with query, anchored-scroll, and browse modes. Shrimpy's browse mode already exists as `sessions list`; query and anchored read are the missing pieces. FTS is an optimization Shrimpy can skip until scan speed is a measured problem.
- Search family: `workspace search` ([SEARCH-002](search-002-workspace-knowledge-search.md)) covers workspace knowledge, `channels search` covers channel logs, this item covers session transcripts, and `search web` ([SEARCH-001](search-001-web-search-provider-wrapper.md)) covers external lookup. Keep help text and empty results cross-pointing the neighboring layers so agents pick the right corpus.
- Future memory-skill guidance should tell agents: search sessions before saving a memory fact, and prefer storing a pointer to evidence over copying content into memory files.
- Likely files: a new `src/sessions/search.ts` (or additions to `src/sessions/service.ts`), `src/commands/sessions.ts`, `src/commands/sessions-format.ts`, and tests beside the existing session tests.

## Done

- `shrimpy sessions search <query>` returns bounded, source-pointed matches across active and archived sessions for one agent, and across all agents with a flag.
- An anchored read command expands a match window without dumping whole transcripts.
- Tool-result bodies are excluded from matching and snippets by default.
- Search works offline on plain JSONL with no LLM or network calls.
- JSON output is stable enough for agent/tool use.
- Tests cover query matching, archived-session inclusion, agent/channel filtering, result bounds, snippet truncation, and tool-result exclusion.
