# CLI-001: Cleaner Command Structure

Status: review
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
- Keep continuation-related inspection aligned with the resources that own the state:
  channels show typed messages, `shrimpy agent attention test` explains handling,
  and schedule/worker commands point at emitted channel message ids.
- Extract command metadata so top-level help, group usage, docs, and tests do
  not drift from separate hand-written strings.
- Generate shell tab-completion definitions from the same command metadata for
  the full `shrimpy` CLI tree.
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
- Shell tab autocomplete is available for the implemented `shrimpy` command
  tree.
- Command names and subcommand verbs follow documented conventions.
- Inspection commands consistently expose `--json` where useful.
- Tests cover command dispatch, help generation, representative usage errors,
  and at least one JSON inspection path per major command group.

## Review Notes

- Kept the implemented canonical resource names for this pass: singular
  `agent` and `surface`; plural `channels`, `sessions`, `schedules`, `skills`,
  `models`, and `users`.
- Added `src/commands/catalog.ts` as the shared command metadata source for
  top-level help, group usage strings, shell completion, and CLI reference docs.
- Added `shrimpy completion bash` and `shrimpy completion zsh`; completion does
  not load workspace config.
- Standardized remaining command usage strings onto the catalog instead of
  file-local hand-written usage text.
- Added CLI catalog tests for generated help, group usage, shell completion,
  no-config completion dispatch, and reference docs coverage for completion.
- Updated the CLI reference and README setup hints for generated completion.
