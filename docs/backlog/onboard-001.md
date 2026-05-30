# 🦐 ONBOARD-001: New User Onboarding Session

Status: todo
Priority: P2
Area: Onboarding

## Why
First-run users currently land in `shrimpy setup init`, which produces baseline files but does not get them to a working agent. The onboarding flow should be a normal guided session run by the bundled `admin` agent ([ADMIN-001](admin-001.md)) that walks the user through provider/model wiring, initial agent shaping, and starter doc persistence.

## Build
- Add an onboarding entry point that launches a guided TUI session as the `admin` agent.
- Cover at minimum: getting one provider/model authenticated and reachable, walking the user through their initial agent's identity and prompt, and persisting the resulting starter docs to the workspace.
- Drive the flow from admin's setup skills/resources rather than embedding flow logic in code.
- Surface clear next steps when onboarding ends (where files landed, how to launch the agent normally).

## Boundaries
- Do not create a separate onboarding runtime or privileged agent species; the session is just admin in setup mode.
- Do not silently overwrite user-edited config or starter docs; mutations happen through explicit user actions.
- Keep `shrimpy setup init` as the minimal non-interactive baseline; the guided session is additive.

## Notes
- Depends on [ADMIN-001](admin-001.md): the admin agent and its setup skills/resources are the substrate this session runs on.
- Sibling to [DOCTOR-001](doctor-001.md): both are bounded admin-agent session entry points using the normal session model. Onboarding is the first-run/setup flavor; doctor is the repair flavor.
- Likely files: `src/cli.ts`, `src/setup.ts`, `src/setup/templates*`, `src/sessions/direct.ts`, and onboarding-specific prompt/skill resources under setup templates.
- Source musing: `docs/musings/framework-design.md` "Init Experience" section.

## Done
- A first-run user can reach a working agent through one guided session.
- The session leaves a coherent set of starter docs and config behind.
- Tests cover command wiring and prompt/resource selection.
