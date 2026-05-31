# CLI-001: Cleaner Command Structure

Status: draft
Priority: P2
Area: CLI

## Why

Shrimpy's CLI has grown feature by feature, and the command map now mixes
resource nouns, nested resource actions, hand-written help text, and separate
usage strings. That is workable while the surface is small, but it will get
harder to keep coherent as schedules, agents, surfaces, apps, browser control,
and worker sessions grow.

A cleaner command structure should make Shrimpy easier for humans to discover
and easier for agents to compose, while preserving the project rule that every
feature has an inspectable `shrimpy <command>` path.

## Build

- Audit the current command tree and choose canonical resource names and verb
  patterns.
- Decide where singular groups should become plural resource groups, especially
  `agent`/`agents` and `surface`/`surfaces`.
- Decide the relationship between nested views such as
  `shrimpy agent schedules <id>` and workspace-wide resource commands such as
  `shrimpy schedules`.
- Extract command metadata so top-level help, group usage, docs, and tests do
  not drift from separate hand-written strings.
- Standardize common verbs and defaults: list, show, read, create/add, set,
  remove, tail, run, and status.
- Standardize `--json` support for inspection commands that agents are expected
  to consume.
- Keep interactive launch and prompt shortcuts clear and separate from
  subcommand dispatch.
- Update `docs/reference/cli.md`, setup hints, and any command mentions in
  seeded skills or workspace templates.

## Boundaries

- Do not redesign behavior and command names in the same patch unless the tests
  make the cutover very clear.
- Do not leave deprecated command shims, compatibility wrappers, or error-only
  placeholder commands behind.
- Do not add a second command framework if `src/commands/framework.ts` can be
  strengthened into the registry Shrimpy needs.
- Keep commands scriptable; do not make any inspection path require an
  interactive session.

## Done

- `shrimpy --help` is generated from command metadata.
- Group usage text and reference CLI docs agree with the implemented command
  registry.
- Command names and subcommand verbs follow documented conventions.
- Inspection commands consistently expose `--json` where useful.
- Tests cover command dispatch, help generation, representative usage errors,
  and at least one JSON inspection path per major command group.
