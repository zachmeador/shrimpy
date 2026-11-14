# 🦐 Hermes Memory and Compaction Survey

Date: 2026-05-21
Rechecked: 2026-08-21
Trimmed: 2026-11-11. Git has the whole note.
Hermes source: local checkout of `nousresearch/hermes-agent`
Hermes commit: `ac8dff4fbcf47a392a3cddcbec068aa05930ab47`
Commit subject: `fix(compression): auto-raise Daybreak Codex threshold`

## Executive Read

Hermes now has separate memory surfaces that should not be collapsed together:

- Built-in curated memory: small, file-backed `MEMORY.md` and `USER.md` entries that are explicitly saved by the agent or by a periodic background review. This is the always-on prompt memory.
- Session search: SQLite and FTS5 transcript recall for past work. This is the right path for task history, completed work, PR numbers, old command output, and other things that should not become durable memory.

Hermes compaction is a working-context feature, not a long-term memory feature. It prunes and summarizes the active message list, refreshes the system prompt when necessary, and notifies external memory providers about the compression boundary. The default in-place mode keeps the same SQLite session id and soft-archives the replaced turns; the optional legacy mode rotates to a linked child session. Durable memory remains separate and is treated as authoritative over compaction summaries.

## Built-In Memory

Source paths:

- `tools/memory_tool.py`
- `agent/prompt_builder.py`
- `agent/system_prompt.py`
- `agent/agent_init.py`
- `agent/conversation_loop.py`
- `agent/background_review.py`

Hermes' built-in memory is a bounded, curated, profile-scoped file store under `$HERMES_HOME/memories/`:

- `MEMORY.md`: the agent's own durable notes: environment facts, project conventions, tool quirks, stable lessons.
- `USER.md`: durable facts about the user: preferences, communication style, role, recurring expectations.

Entries are separated by a section-sign delimiter. The default character budgets are small: `memory_char_limit` defaults to `2200`, and `user_char_limit` defaults to `1375`. Writes use a file lock plus atomic temp file replacement. New entries are deduped exactly, and `replace` / `remove` use a short unique substring through `old_text`.

The current tool schema supports only:

- `add`
- `replace`
- `remove`

There is no exposed `read` action in the current schema, even though the module header still mentions one. Tool responses after mutations include the live entry list and usage, so a writer can see the result of its own write.

The current save policy is stricter than some Hermes docs imply. The prompt guidance and tool schema both say not to save task progress, session outcomes, completed-work logs, temporary TODO state, PR numbers, issue numbers, commit SHAs, file counts, or any fact likely to go stale within a week. The model is told to use `session_search` for past transcripts and to save reusable procedures as skills, not memory.

Hermes also scans memory content for obvious prompt-injection and secret exfiltration patterns before accepting it, because these entries are later rendered into the system prompt.

Every `memory.nudge_interval` user turns defaults to 10, Hermes forks a background review agent after the user has already received the response. It runs with a tool whitelist limited to memory and skill management.

## Session Search

Source path: `tools/session_search_tool.py`

`session_search` is Hermes' long-term transcript recall. It uses the SQLite session database and FTS5 index. It does not call an LLM.

It has three inferred modes:

- Query mode: pass `query`; returns matching sessions, snippets, message windows around matches, and session bookends.
- Scroll mode: pass `session_id` and `around_message_id`; returns an anchored window.
- Browse mode: pass no args; returns recent sessions.

Search dedupes by session lineage and excludes the current lineage, because the active session is already in context. Hidden tool-origin sessions are excluded from browsing/searching by default.

The design implication is clear: Hermes does not try to make everything a memory fact. It keeps raw conversational evidence searchable and asks memory to remain compact.

## Context Compaction

Source paths:

- `agent/context_compressor.py`
- `agent/conversation_compression.py`
- `agent/system_prompt.py`
- `agent/model_metadata.py`

Hermes' compaction system is designed to keep the active context window usable. It does not write durable memory by itself.

Defaults from initialization:

- `compression.enabled`: true
- `compression.threshold`: `0.50`
- minimum threshold floor: `MINIMUM_CONTEXT_LENGTH`
- `summary_target_ratio`: `0.20`
- `protect_last_n`: `20`
- `protect_first_n`: `3`
- `abort_on_summary_failure`: false by default

The compressor computes:

- `threshold_tokens = max(context_length * threshold_percent, MINIMUM_CONTEXT_LENGTH)`
- `tail_token_budget = threshold_tokens * summary_target_ratio`
- `max_summary_tokens = min(context_length * 0.05, 12000)`

The high-level algorithm:

1. Cheaply prune old tool results into one-line summaries, dedupe identical results, and strip historical image payloads.
2. Protect the head: system prompt plus the configured first messages.
3. Protect the tail by token budget, with a minimum message count and boundary alignment so tool calls and tool results are not split badly.
4. Summarize the middle turns with an LLM using a structured template.
5. On later compactions, iteratively update the previous compaction summary instead of summarizing from scratch.

The summary prefix is explicit that compacted turns are reference only, not active instructions. It also says persistent `MEMORY.md` and `USER.md` in the system prompt remain authoritative and active.

The summary template preserves:

- active task
- goal
- constraints and preferences
- completed actions
- active state
- in-progress work
- blockers
- key decisions
- resolved questions
- pending user asks
- relevant files
- remaining work
- critical context

Manual `/compress <focus>` can steer the summarizer to preserve a focus topic with more detail. Even then, the compressor redacts secrets.

Failure behavior is nuanced:

- If a configured auxiliary compression model fails, Hermes can retry once on the main model and warn.
- If summary generation fails and `abort_on_summary_failure=true`, compression returns the original messages unchanged and the session is not rotated.
- With the default false setting, Hermes can insert a static fallback marker and drop the middle window, while recording warning metadata.
- It tracks ineffective compression and avoids thrashing when savings are too small.

After successful compression, Hermes:

- appends any todo snapshot;
- reloads built-in memory and either preserves a matching cached system prompt or rebuilds it;
- commits the pre-compaction transcript to memory providers and context engines;
- by default, rewrites the live transcript on the same session id and soft-archives replaced rows;
- in legacy rotation mode, ends the parent, creates a linked child session, and propagates title lineage;
- persists the compacted transcript and active system prompt;
- notifies the context engine about a compression boundary, using the same id for in-place mode and old/new ids for rotation;
- calls memory provider `on_session_switch(..., reset=false, reason="compression")` in both modes, again using the same id as parent and child for in-place compaction;
- clears file-read dedup state.

The older handoff caveat is now resolved. Hermes captures text returned by `MemoryManager.on_pre_compress()`, redacts and bounds it, and passes it to compatible context engines as `memory_context`. The built-in compressor includes that text in the compaction summary prompt. A plugin engine that does not accept the parameter continues without it and emits a deduplicated warning.

## Shrimpy Design Takeaways

Hermes validates several directions already in Shrimpy's memory design docs:

- Keep durable always-on memory small and high-signal.
- Treat raw transcripts as evidence and make them searchable instead of distilling every prior event into memory.
- Separate working-context compaction from durable memory.
- Make memory writes explicit, inspectable, and reversible.
- Avoid saving completed-work logs as durable memory.

Concrete ideas worth borrowing:

- A clear split between `USER` profile facts and agent self/environment notes.
- A session-search CLI before building heavier memory inference.
- Fenced memory-prefix text with sanitization and stream scrubbing.
- Compression summaries that explicitly say they are reference-only and that persistent memory remains authoritative.

Open risks for Shrimpy:

- If memory upkeep is only scheduled, very important explicit "remember this" instructions may feel delayed unless there is a foreground capture path.
- If context files are free-form markdown, Shrimpy needs strong skill guidance for replacement and pruning so files do not become logs.
