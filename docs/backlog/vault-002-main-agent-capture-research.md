# 🦐 VAULT-002: Main Agent Capture And Research Workflow

Status: todo
Priority: P2
Area: Workspace
Depends On: [VAULT-001](vault-001-default-workspace-collections.md), [CODE-002](code-002-agentic-worker-sessions.md)

## Why

The default `shrimpy` agent should be good at a common home-agent move: the
user sends a link, file, note, product, paper, question, or vague "look into
this" request, and the agent stores it somewhere predictable, catalogs it, and
optionally delegates deeper research to a worker such as Codex.

This is not a new memory database. It is a small workspace habit layered on top
of the shared vault convention: capture the thing, preserve source metadata,
name the folder well, add enough notes to find it later, and return with saved
paths plus next actions.

## Current State

- Only the broad shared-vault convention exists today. There is no starter
  guidance for capture, catalog, inbox, research packets, or vault indexes.
- Worker sessions do not exist yet. The current fallback is `run_child` for
  blocking child work and the `coding-delegation` skill for coding handoff
  packets.
- No helper code or tests exist for research packet path generation.

## Build

- Add starter guidance for the main `shrimpy` agent covering capture, catalog,
  and research requests.
- Define a simple shared-vault layout for arbitrary intake, likely:
  - `vault/inbox/` for quick captures that need later sorting;
  - `vault/research/<YYYY-MM-DD>-<slug>/` for bounded research packets;
  - `vault/catalog.md` or per-collection indexes for lightweight discovery.
- For a captured item, store source material and metadata before analysis where
  practical. Include source URL or origin, capture timestamp, user request,
  saved files, and tags/categories when obvious.
- For delegated research, create a research packet with:
  - `README.md` or `brief.md` describing the user request and current state;
  - `sources.md` for links, citations, and retrieval notes;
  - `notes.md` for findings, uncertainties, and follow-up questions;
  - optional artifacts under a clearly named subfolder.
- Teach the agent to use worker sessions from
  [CODE-002](code-002-agentic-worker-sessions.md) for bounded research or
  implementation work when available, with the vault packet as the handoff
  material.
- Before CODE-002 exists, keep the workflow usable with normal direct sessions,
  `run_child`, or manually invoked tools, but do not create a second durable
  worker abstraction.
- Add light prompt guidance for choosing a folder:
  recipes go under `vault/recipes/`, career applications under
  `vault/career/applications/`, broad investigations under `vault/research/`,
  and unclear items can start in `vault/inbox/`.
- Add guidance to update indexes only when it helps later retrieval. Do not make
  every tiny capture pay a heavy cataloging tax.
- Report saved paths, any spawned worker ids, and unresolved questions back to
  the user.

## Boundaries

- Do not add a database, vector store, hidden catalog service, or opaque memory
  layer.
- Do not auto-spawn workers for every capture. Use workers for bounded research
  or build tasks with a clear goal.
- Do not let worker delegation hide provenance. The vault packet should show
  what was requested, where sources came from, and what changed.
- Do not auto-commit every capture. Use the vault git convention from
  [VAULT-001](vault-001-default-workspace-collections.md): commit kept changes
  when the user wants to preserve a version.
- Do not scrape, download, or store private/account-protected content unless the
  user has provided access and the source allows that use.

## Done

- Fresh main-agent guidance describes the capture, catalog, and research habit.
- Captures land in predictable shared-vault folders with source metadata.
- Research packets provide a clear handoff path for worker sessions.
- The agent can report saved paths and worker status without relying on hidden
  state.
- Tests cover any seeded template/doc changes and helper path generation if code
  is added.
