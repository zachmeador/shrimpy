# Hermes Memory and Compaction Survey

Date: 2026-05-21
Hermes source: local checkout of `sdfgeoff/hermes-agent`
Hermes commit: `2fdefca570973eff014d60aa0904aa39396524d4`
Commit subject: `Merge pull request #28269 from cresslank/chore/tui-remove-unused-babel-deps`

## Executive Read

Hermes now has three separate memory surfaces that should not be collapsed together:

- Built-in curated memory: small, file-backed `MEMORY.md` and `USER.md` entries that are explicitly saved by the agent or by a periodic background review. This is the always-on prompt memory.
- Session search: SQLite and FTS5 transcript recall for past work. This is the right path for task history, completed work, PR numbers, old command output, and other things that should not become durable memory.
- External memory providers: one optional provider at a time, orchestrated by `MemoryManager`. This is where richer evolving user models now live, especially Honcho.

The biggest evolution is that user modeling has moved out of the tiny built-in memory files and into provider lifecycle hooks. Honcho in particular builds a peer model over time from observed turns, then injects a compact context and dialectic user synthesis into the next model call. That provider context is not part of the cached system prompt. It is fenced and appended to the current turn's user message at API-call time.

Hermes compaction is a working-context feature, not a long-term memory feature. It prunes and summarizes the active message list, rotates the SQLite session id, rebuilds the system prompt, and notifies external memory providers about the compression boundary. Durable memory remains separate and is treated as authoritative over compaction summaries.

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

The prompt behavior is intentionally frozen:

- `MemoryStore.load_from_disk()` reads the files and captures a system prompt snapshot.
- `agent/system_prompt.py` injects that frozen snapshot into the volatile tier of the system prompt.
- The full system prompt is cached for the life of the agent instance.
- Mid-session memory writes update disk immediately but do not change the active prompt.
- The snapshot refreshes on the next session start or after context compression invalidates and rebuilds the system prompt.

That frozen-snapshot pattern is mostly about prefix-cache stability. It also prevents the model from changing its own active instructions mid-turn by writing memory.

The current save policy is stricter than some Hermes docs imply. The prompt guidance and tool schema both say not to save task progress, session outcomes, completed-work logs, temporary TODO state, PR numbers, issue numbers, commit SHAs, file counts, or any fact likely to go stale within a week. The model is told to use `session_search` for past transcripts and to save reusable procedures as skills, not memory.

Hermes also scans memory content for obvious prompt-injection and secret exfiltration patterns before accepting it, because these entries are later rendered into the system prompt.

## How Built-In User Memory Grows

There are two write paths into built-in memory:

1. Foreground tool use. The main agent can call `memory(action=...)` when it notices durable user or environment facts.
2. Periodic background review. Every `memory.nudge_interval` user turns defaults to 10, Hermes forks a background review agent after the user has already received the response. The review agent replays the conversation snapshot and decides whether to save anything to `MEMORY.md` or `USER.md`.

The background review is deliberately constrained:

- It is spawned after the main response, so it does not compete with the active task.
- It inherits the parent model/runtime and cached system prompt for cache parity.
- It runs with a tool whitelist limited to memory and skill management.
- It is created with `skip_memory=True`, so it does not touch external memory providers.
- It is then rebound to the parent's built-in `MemoryStore`, so its memory writes still update `MEMORY.md` and `USER.md`.

That last point is important. The periodic review only updates the small built-in memory files and skills. It is prevented from leaking its harness prompt into Honcho, Mem0, Supermemory, or other provider namespaces.

Hermes also hydrates the memory nudge counters from persisted conversation history. This matters in gateway modes where a fresh `AIAgent` may be created for each inbound message; without hydration the every-N-turn review would rarely fire.

## Session Search

Source path: `tools/session_search_tool.py`

`session_search` is Hermes' long-term transcript recall. It uses the SQLite session database and FTS5 index. It does not call an LLM.

It has three inferred modes:

- Query mode: pass `query`; returns matching sessions, snippets, message windows around matches, and session bookends.
- Scroll mode: pass `session_id` and `around_message_id`; returns an anchored window.
- Browse mode: pass no args; returns recent sessions.

Search dedupes by session lineage and excludes the current lineage, because the active session is already in context. Hidden tool-origin sessions are excluded from browsing/searching by default.

The design implication is clear: Hermes does not try to make everything a memory fact. It keeps raw conversational evidence searchable and asks memory to remain compact.

## External Memory Provider Layer

Source paths:

- `agent/memory_provider.py`
- `agent/memory_manager.py`
- `agent/agent_init.py`
- `agent/conversation_loop.py`
- `run_agent.py`

External memory providers are additive to built-in memory. Hermes allows at most one external provider at a time to avoid tool-schema bloat and conflicting memory backends.

`agent_init.py` reads `memory.provider`, loads the plugin, wraps it in a `MemoryManager`, initializes it with session/profile/platform identity, and adds the provider's tool schemas to the agent tool surface. The init metadata includes the Hermes session id, platform, Hermes home, agent context, optional session title, gateway user/chat/thread ids, gateway session key, active Hermes profile, and `agent_workspace: hermes`.

The provider interface is lifecycle-oriented:

- `initialize(session_id, **kwargs)`
- `system_prompt_block()`
- `prefetch(query)`
- `queue_prefetch(query)`
- `sync_turn(user_content, assistant_content)`
- `get_tool_schemas()` and `handle_tool_call(...)`
- optional hooks: `on_turn_start`, `on_session_end`, `on_session_switch`, `on_pre_compress`, `on_memory_write`, `on_delegation`, `shutdown`

The static provider block from `system_prompt_block()` is included in the system prompt. Dynamic recall is handled differently. At each turn:

1. `on_turn_start()` fires so providers can update cadence counters.
2. `prefetch_all(original_user_message)` runs once before the tool loop.
3. The combined provider output is wrapped in `<memory-context>` with a system note saying it is recalled memory context, not user input.
4. That fenced context is appended to the current turn's user message only in the outgoing API request.
5. The persisted `messages` list is not mutated by the injection.
6. At the end of a completed, non-interrupted turn, Hermes calls `sync_all()` and then `queue_prefetch_all()` for the next turn.

`MemoryManager` strips nested `<memory-context>` blocks and system notes from provider output before injection. It also has a streaming scrubber that removes memory-context spans from model output even when tags are split across stream chunks.

## Honcho

Source paths:

- `plugins/memory/honcho/__init__.py`
- `plugins/memory/honcho/client.py`
- `plugins/memory/honcho/session.py`
- `plugins/memory/honcho/README.md`
- `website/docs/user-guide/features/honcho.md`

Honcho is the most relevant provider for Shrimpy's user-memory design. It is not just a semantic memory store. It models peers and sessions and can ask a dialectic reasoning service for synthesized user understanding.

Identity and scope:

- Hermes maps the human to a Honcho peer. In gateway contexts it prefers the gateway user id unless `pinPeerName` is set; otherwise it falls back to configured peer names or channel/chat ids.
- Hermes maps the assistant to an AI peer. Profiles can have separate AI peer identities.
- The active Honcho host is profile-aware: `hermes` or `hermes.<profile>`.
- Session scoping can be manual, title-based, gateway-session-key based, per-Hermes-session, per-repo, per-directory, or global. The default is effectively directory-scoped.

Observation modes decide who learns from whom:

- `directional`: user and AI observe both self and other.
- `unified`: the user observes self only; the AI observes the user only.
- More granular per-peer observation settings can override the presets.

Honcho has three recall modes:

- `hybrid`: inject context and expose tools.
- `context`: inject context but hide tools.
- `tools`: expose tools but do not inject context.

Initialization can migrate existing Hermes files into Honcho for non per-session strategies: `MEMORY.md`, `USER.md`, and `SOUL.md` can be uploaded as prior memory files.

Turn recall has two layers:

- Base context: Honcho session summary, user representation, user card, AI self-representation, and AI card. This is cadence-controlled by `contextCadence`.
- Dialectic supplement: Honcho `.chat()` synthesis about the current user/task, cadence-controlled by `dialecticCadence` with `dialecticDepth` 1 to 3.

Honcho skips trivial prompts and slash-command-like messages, supports `injectionFrequency=first-turn`, truncates to configured context-token budgets, and prewarms context/dialectic in background when possible.

Turn persistence is asynchronous. At end of turn, Hermes sanitizes any injected memory context out of the user and assistant content, chunks long messages, and writes user plus assistant messages into the Honcho session. On session end it flushes pending writes.

Honcho's tools include:

- `honcho_profile`: read or update a peer card.
- `honcho_search`: semantic search over raw excerpts.
- `honcho_context`: retrieve summary/representation/card/recent-message context.
- `honcho_reasoning`: ask the dialectic reasoning path.
- `honcho_conclude`: create or delete persistent conclusions.

Built-in memory writes are partially mirrored. `on_memory_write` mirrors `target=user` add operations into Honcho conclusions. Replace/remove are not mirrored as equivalent edits.

The important architecture detail: Honcho's dynamic user model is not rendered into the stable system prompt. Its recalled context is fenced and injected into the current user message at request time.

## Other Providers

Hermes currently ships several external providers. The exact set matters less than the common provider lifecycle shape.

| Provider | Memory Shape | Build-Over-Time Behavior |
| --- | --- | --- |
| Honcho | Peer/session model plus dialectic synthesis | Ingests completed turns, updates peer/session context, injects base context and synthesized user understanding. |
| Mem0 | Cloud/server-side fact extraction and semantic search | Sends completed turns to Mem0; Mem0 extracts and dedupes facts. Explicit `mem0_conclude` stores verbatim facts with inference disabled. |
| Hindsight | Knowledge graph/entity memory | Buffers serialized turn batches, periodically retains them with session/user metadata, and recalls or reflects into turn context. Flushes and resets per-session state on session switch. |
| OpenViking | Session ingest with category extraction | Stores turns into an OpenViking session and commits at session end, triggering extraction into profile, preferences, entities, events, cases, and patterns. |
| Supermemory | Cloud semantic memory/profile | Auto-captures cleaned substantive turns, ingests full cleaned sessions on session end, and injects profile/search results. |
| ByteRover | Local-first hierarchical knowledge tree via `brv` CLI | Synchronously queries before a turn and curates completed turns in background. Has an `on_pre_compress` flush hook. |
| Holographic | Local SQLite structured fact store with entity/trust retrieval | Mostly explicit fact CRUD via tools; optional session-end auto extraction; mirrors built-in add writes as facts. |
| RetainDB | Cloud memory with durable SQLite write-behind queue | Queues turns for async ingest, prefetches context/user synthesis/agent self-model, and exposes profile/search/context/remember/file tools. |

The Shrimpy-relevant pattern is not any one vendor. It is the interface: prefetch before the turn, sync after the turn, mirror explicit memory writes, handle session boundaries, and keep provider failures best-effort.

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
- invalidates and rebuilds the cached system prompt, reloading memory from disk;
- commits the old session to memory providers and context engines;
- ends the old SQLite session with reason `compression`;
- creates a new session id with `parent_session_id` pointing to the old one;
- propagates title lineage;
- updates the new session row with the rebuilt system prompt;
- calls context engine `on_session_start(..., boundary_reason="compression")`;
- calls memory provider `on_session_switch(new_session_id, parent_session_id, reset=false, reason="compression")`;
- clears file-read dedup state.

One code caveat: `MemoryManager.on_pre_compress()` is documented as returning provider text to include in the compression summary prompt, and ByteRover uses the hook to flush pre-compression context. In `conversation_compression.py`, Hermes currently calls `agent._memory_manager.on_pre_compress(messages)` but does not use the returned text. So provider side effects happen, but provider text is not actually spliced into the compression prompt through that return path.

## End-To-End Turn Flow

For a normal completed turn with built-in memory and an external provider:

1. Conversation history is loaded and counters are hydrated.
2. The user-turn count increments.
3. The memory-review cadence may set a background review flag.
4. The current user message is appended to the persistent message list.
5. The cached system prompt is built or reused. Built-in memory snapshots and the provider static prompt block are in that prompt.
6. The external provider receives `on_turn_start`.
7. The external provider is queried once with the original clean user message.
8. Provider recall is fenced as `<memory-context>` and injected into the current user message only in the API request.
9. The model/tool loop runs.
10. Streaming output is scrubbed so memory-context tags cannot leak to the UI.
11. The completed turn is synced to the provider, and next-turn prefetch is queued.
12. If cadence fired, a background review agent may update built-in memory and skills.

Interrupted turns are not synced to external memory providers. Hermes treats partial assistant output and aborted tool chains as non-durable conversational truth.

## Docs And Code Drift Noticed

Hermes' current source is stricter than parts of the docs:

- `website/docs/user-guide/features/memory.md` still implies that task progress or completed work can be good memory. Current prompt/tool guidance explicitly says not to save that and to use `session_search` instead.
- `tools/memory_tool.py`'s module header still mentions a `read` action, but the current schema and dispatcher expose only `add`, `replace`, and `remove`.
- Some Honcho docs describe context as being injected into the system prompt. Current request assembly injects dynamic provider recall into the current user message at API-call time; only static provider guidance is in the system prompt.

## Shrimpy Design Takeaways

Hermes validates several directions already in Shrimpy's memory design docs:

- Keep durable always-on memory small and high-signal.
- Treat raw transcripts as evidence and make them searchable instead of distilling every prior event into memory.
- Separate working-context compaction from durable memory.
- Make memory writes explicit, inspectable, and reversible.
- Keep provider recall fenced, labeled, and separate from user input.
- Notify memory systems about session rotation and compression boundaries.
- Avoid saving completed-work logs as durable memory.

Where Shrimpy likely should diverge:

- Hermes' external providers are powerful but opaque. Shrimpy's local-first markdown context direction is still a better fit for a home agent where the user should be able to inspect and edit memory directly.
- Hermes allows foreground mid-session memory writes; Shrimpy's current tracking doc argues for scheduled upkeep instead. That remains a reasonable product stance if the goal is less surprise and less sludge.
- Hermes' background review is hidden runtime behavior. Shrimpy's design prefers normal schedules, channel-visible orders, and agent-authored context files. That is more legible.
- Honcho's peer modeling is valuable as a reference, but importing its whole peer/session/dialectic control plane would fight Shrimpy's simpler nouns: users, agents, channels, sessions, schedules, skills, and files.

Concrete ideas worth borrowing:

- Frozen prompt snapshots for session-stable always-on memory.
- A clear split between `USER` profile facts and agent self/environment notes.
- A session-search CLI before building heavier memory inference.
- Provider-style lifecycle hooks even if the first provider is just local markdown upkeep: `prefetch`, `sync_turn`, `on_session_switch`, `on_pre_compress`.
- Fenced memory-prefix text with sanitization and stream scrubbing.
- Compression summaries that explicitly say they are reference-only and that persistent memory remains authoritative.
- User-turn cadence hydration from persisted history so scheduled memory upkeep remains reliable across process restarts.

Open risks for Shrimpy:

- If memory upkeep is only scheduled, very important explicit "remember this" instructions may feel delayed unless there is a foreground capture path.
- If context files are free-form markdown, Shrimpy needs strong skill guidance for replacement and pruning so files do not become logs.
- If Shrimpy adds provider hooks, returned context should have one obvious path into turn context. Hermes' unused `on_pre_compress` return is a useful warning against interface promises that are only partially wired.
