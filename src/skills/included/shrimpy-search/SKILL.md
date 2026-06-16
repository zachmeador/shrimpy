---
name: shrimpy-search
description: Use when looking up existing Shrimpy workspace knowledge, session history, channel messages, or turn context before answering or inventing new state.
---

# Shrimpy Search

Use this skill when the user asks what Shrimpy already knows, when you need prior context, or before creating a new note, memory, watch, channel, agent, or handoff that may already exist.

Read `profile/WORKSPACE.md` first when you need exact local paths. For more detail after this skill, use `docs/reference/workspace.md`, `docs/reference/sessions.md`, `docs/reference/channels.md`, and `docs/reference/context-assembly.md`.

## Choose The Corpus

- Written workspace knowledge: `profile/*.md`, workspace skills, agent skills, `agents/<id>/context/`, and `agents/<id>/vault/`.
- Session transcripts: active and archived Pi conversation history under each agent.
- Channel logs: shared message records, watch messages, status/control records, and surface messages.
- Current turn context: what Shrimpy would load for an agent, channel, session type, and prompt.

Search before inventing, but keep searches bounded. Prefer one or two specific queries over broad crawling.

## Commands

```bash
shrimpy workspace search "<query>" --limit 10
shrimpy workspace index status
shrimpy sessions search "<query>" --agent <agent-id> --limit 10
shrimpy sessions search "<query>" --all-agents --limit 10
shrimpy sessions read <session-path> --around <entry-id> --window 4 --agent <agent-id>
shrimpy channels search <channel> "<query>" --limit 10
shrimpy channels search <channel> --kind watch --limit 10
shrimpy channels read <channel> --limit 20
shrimpy context turn --agent <agent-id> --channel <channel>
shrimpy context --agent <agent-id> --sections
```

Use `--json` when you need exact paths, entry ids, timestamps, or machine-readable snippets. Use `--full` on `channels read` or `channels search` only when clipped output hides necessary detail.

## How To Use Results

Open or read the specific files, transcript windows, or channel records that look relevant. Do not treat search snippets as complete evidence. If results disagree, prefer the most recent durable file or source record and mention uncertainty.

When a result points to a reusable saved file or research packet, use `remember` before adding related material. When it points to channel routing, use `shrimpy-channels`. When it points to recurring work, use `shrimpy-watches`. When it points to skill ownership or package state, use `shrimpy-skills`.

If searches find nothing useful, say what you searched and continue with the smallest next action.

## Guardrails

- Do not crawl broad filesystem roots unless the user approved broader path scope.
- Do not expose secret-looking snippets from auth, config, runtime logs, or private vault material unless the user explicitly needs them.
- Do not create duplicate memories, vault notes, watches, channels, agents, or skills until you have searched the likely corpus.
- Do not use search as authorization. Visibility means the agent can inspect a record, not that it may change it.
