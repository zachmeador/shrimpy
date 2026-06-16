# CODE-004: Agent Worker Tools

Status: todo
Priority: P3
Area: Coding Agents

## Why

The worker lifecycle is CLI-first so agents can already use it through Bash. Dedicated daemon tools may make common worker operations easier later, but they should mirror the CLI instead of creating another lifecycle.

## Build

- Add bounded Shrimpy daemon tools for worker start, list/status/read, send amendment, wait, cancel, and close.
- Return structured, compact outputs suitable for model use.
- Enforce the same ownership and availability rules as the CLI.
- Keep `shrimpy-coding-delegation` aligned with the tool names and expected review workflow.

## Boundaries

- No resurrected `run_child` alias or one-shot hidden worker wrapper.
- No conversational supervision or mid-turn steering tool.

## Done

- Agents can manage workers without shelling out, and the tool outputs match the CLI behavior.
- Tests cover tool registration, policy exclusion, output shapes, and error cases.
