# 🦐 TOOLS-001: Unified Agent Tool Capability View

Status: done
Priority: P1
Area: Runtime

## Why
`shrimpy agent list` reports Shrimpy-declared daemon tools such as `send_message`, `read_channel`, and `run_child`, but it does not expose the default Pi tools an agent can also use. This makes the agent capability model misleading: an operator cannot tell from Shrimpy's UX whether an agent has access to Pi-provided tools such as shell/bash, which matters when tightening permissions for a specific agent.

Shrimpy should present one conceptual tool capability view per agent: Shrimpy tools, Pi default tools, and any effective disables or overrides should be visible in one place.

## Build
- Define the agent-facing tool capability model Shrimpy wants to expose.
- Include Pi default tools in agent inspection output.
- Show tool origin or category clearly enough to distinguish Shrimpy capabilities from Pi-provided capabilities.
- Add effective tool policy inspection for a single agent, not only the compact `agent list` table.
- Support disabling Pi tools, especially shell/bash, at the agent configuration level.
- Ensure session creation applies the same effective tool policy shown by the CLI.

## Boundaries
- Do not rebuild Pi's tool runtime unless Pi cannot express the needed policy.
- Do not introduce a second hidden control plane for skills or agent behavior.
- Do not keep compatibility aliases or old display paths once the unified view replaces them.

## Notes
- Current misleading example:

  ```text
  shrimpy  root=agents/shrimpy  tools=send_message,read_channel,run_child  thinking=off
  ole_scrappy  root=agents/ole_scrappy  tools=send_message,read_channel,run_child  thinking=off
  ```

- Desired UX should make it obvious whether the effective tool set includes Pi shell/bash tools.
- Likely files: `src/config/agents.ts`, `src/commands/*`, `src/sessions/factory.ts`, and any Pi adapter layer that maps Shrimpy configuration into Pi session options.
- Consider compact list output plus a richer `shrimpy agent inspect <id>` or similar command for full effective capability details.
- Related: [TUI-001](tui-001.md), because `!`/`!!` bash input and slash/settings discovery are part of the same user-facing capability surface. `TOOLS-001` should define the effective agent tool policy; `TUI-001` should present that policy coherently in interactive mode.
- This no longer needs to depend on a Pi patch for core policy. Current Pi exposes:
  - CLI tool selection with `--tools`, `--exclude-tools`, `--no-builtin-tools`, and `--no-tools`.
  - SDK tool selection with `createAgentSession({ tools, excludeTools, noTools, customTools })`.
  - Extension inspection and mutation with `getActiveTools`, `getAllTools`, and `setActiveTools`.
  - Tool provenance through `ToolInfo.sourceInfo`, including built-in, SDK, and extension sources.
  - Same-name built-in tool overrides.
  - `user_bash` interception for `!` / `!!` input.
- Pi's default active built-ins remain `read`, `bash`, `edit`, and `write`; the built-in registry also includes `grep`, `find`, and `ls`. Shrimpy inspection should distinguish registered, active, excluded, and custom daemon tools instead of treating all Pi-known tools as active.
- Pi's `getAllTools()` includes `parameters` and `promptGuidelines`, which makes it useful for richer inspection and future prompt-policy diagnostics.
- Agent-level disables should map to Pi `excludeTools` where possible. Use `tools` only when Shrimpy wants a strict allowlist; otherwise `excludeTools` is less brittle as Pi adds new safe built-ins.
- Related: [PI-001](pi-001.md) only if Shrimpy later requires Pi-owned TUI affordances to visually hide or relabel capability state that is already enforced.

## Done
- `shrimpy agent list` no longer implies the Shrimpy-only tools are the complete tool set.
- A per-agent command shows the complete effective tool capability view, including Pi defaults and disabled tools.
- Per-agent config can disable shell/bash access.
- Session creation enforces the same effective tool policy shown by inspection.
- Tests cover default Pi tools, disabled Pi tools, and CLI output for effective capabilities.
