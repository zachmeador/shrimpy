# CTX-008: Runtime Context Producers As CLI Commands

Status: todo
Priority: P2
Area: Context

## Why

Runtime turn-context producers are visible beside file, directory, and command
sources, but they are still internal framework emitters. Giving each producer a
deterministic CLI render path would make debugging cleaner and may let the
runtime source type collapse into ordinary command-like context sources later.

## Build

- Define explicit inputs for rendering built-in runtime context producers.
- Add CLI coverage for rendering individual runtime producers with agent,
  channel, and turn/session inputs where relevant.
- Decide whether `runtime` remains a source type or becomes a set of built-in
  command-backed sources.
- Keep prompt assembly on the existing unified context-source path.

## Boundaries

- Do not create a second prompt assembly path.
- Keep output compact, deterministic, and inspectable.
- Do not add migration or compatibility code unless a concrete workspace-facing
  break requires it.

## Done

- Built-in turn-context producers can be rendered individually from the CLI.
- `shrimpy context sources list/run` still exposes the effective context surface.
- Tests cover source listing, source rendering, and prompt assembly parity.
