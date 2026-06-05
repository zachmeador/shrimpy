# 🦐 CLI-001: Calm Front-Door Command Surface

Status: done
Priority: P2
Area: CLI

## Why

Shrimpy's CLI should stay fully agent-addressable, but the human-facing command surface is starting to feel like a flat list of internal subsystems. Daily use should have a small, calm front door, while diagnostics, plumbing, and service lifecycle commands stay available without dominating default help.

The CLI should organize around user intentions first and implementation areas second.

## Current State

- Command metadata now lives in `src/commands/catalog.ts`; top-level help, group usage, reference docs, and shell completion are generated from it.
- Root, group, nested namespace, and leaf-command `--help` / `-h` output is now catalog-backed and short-circuits before workspace config loading.
- Default `--help` shows the calm common surface, while `shrimpy help all` prints the complete command catalog.
- Full help, reference docs, and shell completion still expose advanced diagnostics, admin commands, and agent-oriented inspection commands.
- `shrimpy chat [agent]` is now available as the plain TUI front door. Bare `shrimpy`, `shrimpy agent tui <id>`, and `shrimpy run` remain available session entrypoints.

## Build

- Add `shrimpy chat [agent]` as the primary TUI front door.
- Keep `shrimpy chat` equivalent to bare `shrimpy`.
- Make `shrimpy chat <agent>` open the TUI for that agent.
- Preserve direct prompt entry for the bare command path unless a later design deliberately replaces it.
- Define CLI tiers:
  - front-door commands for common human actions;
  - resource commands for durable user concepts;
  - `inspect` or `debug` commands for diagnostics;
  - admin/system commands for workspace, gateway, and shell integration.
- Reduce default `--help` to the calm common surface, with a full help path for advanced and agent-oriented commands.
- Make every important CLI level answer `--help` and `-h` with useful catalog-backed output: root, command groups, nested namespaces, and leaf commands.
- Prefer user-intention names at the top level over internal subsystem names.

## Prospective Command Tree

```text
shrimpy
  chat
  ask
  status
  help
    all

  agents
    list
    show
    add
    set
    rename
    remove
    wake
      show
      set
      clear
    watches
      list
      show

  channels
    list
    show
    read
    search
    tail
    create
    post
    dm
    members
    join
    leave

  watches
    list
    once
    show
    cancel

  skills
    list
    show
    add
    install
    validate

  workspace
    setup
      init
      telegram
    config
      show
    users
      list
    owner
      show
      set

  gateway
    status
    start
    stop
    restart
    install
    uninstall

  inspect
    agents
      tools
      wake
      sessions
      watches
    channels
      messages
      membership
      sources
    context
      prompt
      sections
      turn
      config
      files
        list
        show
      sources
        list
        run
    models
      list
      resolve
    watches
      list
      show
    sessions
      list
      compaction
    surfaces
      list
      show

  debug
    gateway
      logs
    completion
      bash
      zsh
      install
      write-state
      status
```

This tree is a product-shape sketch, not a migration plan. Exact arguments, aliases, breaking changes, and old-command removal should be decided in the implementation slices.

## Slices

- CLI-001A: Done. Add `shrimpy chat [agent]` and document it as the preferred TUI entrypoint.
- CLI-001B: Done. The reference CLI doc now states the command naming, resource naming, JSON, help, and discovery rules.
- CLI-001C: Done. Catalog entries have default/full visibility, so default help shows common commands while `shrimpy help all` and completion expose the complete surface.
- CLI-001D: Done. No commands were moved in this slice; resource-owned diagnostics stay under their resource groups, and the CLI rule now reserves `inspect` or `debug` for cross-cutting diagnostics that would be clearer outside an existing owner.
- CLI-001E: Done. The current singular/plural names are retained as the implemented resource surface: singular `agent` and `surface`, plural `channels`, `sessions`, `watches`, `skills`, `models`, and `users`.

## Boundaries

- Do not reduce CLI coverage; every feature should remain reachable from shell commands.
- Do not hide agent-friendly JSON inspection commands from completion or full help.
- Do not add permanent aliases for renamed commands unless explicitly chosen as a compatibility policy.
- Do not let debug/plumbing commands define the default mental model for new users.

## Done

- `shrimpy chat` opens the same TUI experience as bare `shrimpy`.
- `shrimpy chat <agent>` opens that agent's TUI session.
- Default help reads as a small front door rather than a full subsystem dump.
- Root, group, nested namespace, and leaf-command `--help` / `-h` output is useful, non-erroring, and generated from the shared command catalog where practical.
- Advanced inspect/debug/plumbing commands remain discoverable through full help, docs, and shell completion.
- New CLI additions have a clear rule for where they belong.
