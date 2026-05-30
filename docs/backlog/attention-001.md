# 🦐 ATTENTION-001: Fine-Grained Agent Attention CLI Mutators

Status: todo
Priority: P1
Area: Agents

## Why
Agent attention policy is inspectable and testable, but mutation is still too coarse for day-to-day configuration. Users and agents need direct commands for editing channel overrides and filters without hand-editing workspace JSON.

## Build
- Add CLI mutators beyond the coarse `--attention` mode.
- Support set/clear channel overrides.
- Support sender, actor id, and user id filters.
- Keep `agent attention` and `agent attention test` as the inspection and explanation path.

## Boundaries
- Do not replace the existing attention policy model unless the current data shape blocks the commands.
- Do not add hidden automation; configuration changes should remain explicit CLI actions.

## Notes
- Likely files: `src/commands/agent.ts`, `src/agents/channel-policy.ts`, `src/agents/workspace-manager.ts`, and config parsing helpers.
- Preserve channel membership as the source of participation; attention only decides whether a member handles a message.

## Done
- CLI can set and clear each supported attention field.
- `agent attention show/test` reflects the edited policy.
- Focused tests cover mutation and attention decision behavior.
