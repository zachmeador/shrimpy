# 🦐 MECH-002: Direct Mechanic TUI Command

Status: todo
Priority: P1
Area: Mechanic
Depends On: [ADMIN-001](admin-001.md), [MODEL-001](model-001-user-configurable-model-policy.md)

## Why

Every Shrimpy environment should have two default agents: `shrimpy` for normal
home-agent work and `mechanic` for setup, repair, configuration, and extension
work. The user-facing command for talking to the maintenance specialist should
be `shrimpy mechanic`, not `shrimpy doctor`.

This keeps the product model simple: if a user wants to change or repair the
home, they open the mechanic and talk to it.

## Build

- Add `shrimpy mechanic [prompt]` as a top-level command that opens a TUI chat
  with agent id `mechanic`.
- Use the normal session runtime, model policy resolution, context assembly,
  session storage, skills, and TUI. Mechanic is not a special runtime species.
- Launch through the coding/maintenance policy so setup, repair, and extension
  work uses the same capable path as other heavy work.
- Mirror useful root TUI overrides where appropriate, such as model policy,
  provider/model escape hatch, thinking level, skill selection, and initial
  prompt.
- Include `shrimpy mechanic` in the CLI catalog, shell completion, and reference
  docs.
- Make new environment init create both `shrimpy` and `mechanic`; the command can
  assume mechanic exists in a valid initialized environment.

## Boundaries

- Do not add `shrimpy doctor` as a competing top-level command.
- Do not create a separate repair runtime, hidden control plane, or privileged
  mechanic species.
- Do not silently mutate workspace config just because the command opens.
  Mechanic-led changes still require explicit user action and should use normal
  CLI/config paths.
- Do not add compatibility shims for legacy workspaces unless a release plan
  explicitly asks for migration support.

## Notes

- [ADMIN-001](admin-001.md) establishes the bundled mechanic agent and default
  workspace shape.
- [SETUP-002](setup-002-provider-model-policy-bootstrap.md) should make the
  coding/maintenance policy resolvable before first mechanic-led onboarding.
- Repair and diagnostics can still be mechanic-led workflows or status
  subcommands, but the durable conversational front door is `shrimpy mechanic`.

## Done

- `shrimpy mechanic` opens a direct TUI session with agent `mechanic`.
- Freshly initialized environments contain both default agents: `shrimpy` and
  `mechanic`.
- The command uses the coding/maintenance model policy by default.
- CLI help, completion, and docs show `shrimpy mechanic` as the maintenance
  entry point.
- Tests cover command wiring, default agent selection, missing-mechanic failure
  messaging, and model-policy selection.
