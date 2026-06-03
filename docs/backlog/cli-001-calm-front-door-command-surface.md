# 🦐 CLI-001: Calm Front-Door Command Surface

Status: todo
Priority: P2
Area: CLI

## Why

Shrimpy's CLI should stay fully agent-addressable, but the human-facing command
surface is starting to feel like a flat list of internal subsystems. Daily use
should have a small, calm front door, while diagnostics, plumbing, and service
lifecycle commands stay available without dominating default help.

The CLI should organize around user intentions first and implementation areas
second.

## Build

- Add `shrimpy chat [agent]` as the primary TUI front door.
- Keep `shrimpy chat` equivalent to bare `shrimpy`.
- Make `shrimpy chat <agent>` open the TUI for that agent.
- Preserve direct prompt entry for the bare command path unless a later design
  deliberately replaces it.
- Define CLI tiers:
  - front-door commands for common human actions;
  - resource commands for durable user concepts;
  - `inspect` or `debug` commands for diagnostics;
  - admin/system commands for workspace, gateway, and shell integration.
- Reduce default `--help` to the calm common surface, with a full help path for
  advanced and agent-oriented commands.
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

This tree is a product-shape sketch, not a migration plan. Exact arguments,
aliases, breaking changes, and old-command removal should be decided in the
implementation slices.

## Slices

- CLI-001A: Add `shrimpy chat [agent]` and document it as the preferred TUI
  entrypoint.
- CLI-001B: Draft a short CLI constitution covering top-level command rules,
  resource naming, JSON expectations, and help visibility.
- CLI-001C: Add command visibility tiers so default help can show common
  commands while completion and full help still expose the complete surface.
- CLI-001D: Move diagnostic commands under an `inspect` or `debug` namespace
  where that improves human discoverability.
- CLI-001E: Revisit singular/plural resource naming as a deliberate breaking
  design pass, without carrying permanent compatibility shims.

## Boundaries

- Do not reduce CLI coverage; every feature should remain reachable from
  shell commands.
- Do not hide agent-friendly JSON inspection commands from completion or full
  help.
- Do not add permanent aliases for renamed commands unless explicitly chosen
  as a compatibility policy.
- Do not let debug/plumbing commands define the default mental model for new
  users.

## Done

- `shrimpy chat` opens the same TUI experience as bare `shrimpy`.
- `shrimpy chat <agent>` opens that agent's TUI session.
- Default help reads as a small front door rather than a full subsystem dump.
- Advanced inspect/debug/plumbing commands remain discoverable through full
  help, docs, and shell completion.
- New CLI additions have a clear rule for where they belong.
