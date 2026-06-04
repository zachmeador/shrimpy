# 🦐 ONBOARD-001: New User Onboarding Session

Status: todo
Priority: P2
Area: Onboarding

## Why
First-run users no longer have only `shrimpy setup init`: `shrimpy setup`
initializes the workspace, can launch a Pi provider-bootstrap TUI when no
models are available, and then starts a setup-skill TUI as `shrimpy`. That is
an interim setup flow, not the intended mechanic-led onboarding flow.

The onboarding flow should be a normal guided session run by the bundled
`mechanic` agent ([ADMIN-001](admin-001.md)) that walks the user through model
policy wiring, initial agent shaping, and starter doc persistence.

## Current State

- `shrimpy setup init` remains the minimal baseline file creation path.
- `shrimpy setup` now runs `runSetupEntry`: it initializes files, checks
  Pi-visible models, optionally launches a provider bootstrap session using
  Pi's `/login` and `/model`, and launches the setup skill when a model is
  available.
- The setup skill lives under `agents/shrimpy/skills/setup/` and includes a
  validator script. It is not mechanic-owned yet.
- There is no model-policy bootstrap or bundled mechanic handoff yet.

## Build
- Add an onboarding entry point that launches a guided TUI session as the
  `mechanic` agent through the `coding` model policy.
- Cover at minimum: getting `coding` authenticated and reachable first, deciding
  whether the main Shrimpy agent should use `coding` or a separate local/private
  policy, walking the user through their initial agent's identity and prompt,
  and persisting the resulting starter docs to the workspace.
- Start by asking for Pi-visible auth for a capable hosted model when no
  `coding` policy is configured. The normal path should use `coding` for both
  mechanic/setup work and everyday Shrimpy; a separate local/private policy is
  an advanced preference, not the expected first-run path.
- Ask only a small number of file-changing questions during first setup: what to
  call the user, what the default Shrimpy agent should be like, whether to use
  `coding` or a separate local/private policy for everyday Shrimpy, whether to
  add a chat surface now, and whether Shrimpy may proactively message the user.
- Ask whether the user wants a chat surface at all, and if so which platform
  they prefer. Telegram is the first implemented option, but the flow should be
  shaped to add more surfaces later without rewriting the setup conversation.
- Include a short, consultative explainer for when to create a new agent or
  app-agent instead of using the default agent, a skill, an agent-owned watch, or
  a channel.
- Drive the flow from mechanic's setup skills/resources rather than embedding flow logic in code.
- Surface clear next steps when onboarding ends (where files landed, how to launch the agent normally).

## Boundaries
- Do not create a separate onboarding runtime or privileged agent species; the
  session is just mechanic in setup mode.
- Do not silently overwrite user-edited config or starter docs; mutations happen
  through explicit user actions.
- Keep `shrimpy setup init` as the minimal non-interactive baseline; the guided session is additive.

## Notes
- Depends on [ADMIN-001](admin-001.md): the mechanic agent and its setup
  skills/resources are the substrate this session runs on.
- Depends on [MODEL-001](model-001-user-configurable-model-policy.md):
  onboarding should create or validate `coding` first, then default the main
  Shrimpy agent to `coding` unless the user chooses a separate policy.
- Depends on [SETUP-002](setup-002-provider-model-policy-bootstrap.md):
  deterministic provider auth and model policy bootstrap should complete before
  the mechanic-guided conversation starts.
- Depends on [MECH-002](mech-002-direct-mechanic-tui-command.md):
  `shrimpy mechanic` is the direct TUI front door for setup, repair, extension
  work, and later return visits after onboarding.
- Likely files: `src/cli.ts`, `src/setup/init.ts`, `src/setup/service.ts`, `src/setup/templates*`, `src/sessions/direct.ts`, and onboarding-specific prompt/skill resources under setup templates.
- Source musing: `docs/musings/framework-design.md` "Init Experience" section.
- Related musing: `docs/musings/app-habitats.md` covers the agents-as-apps/app-agent graduation idea that onboarding should explain in plain terms.

## Done
- A first-run user can reach a working agent through one guided session.
- The first working model path is `coding`, and the main Shrimpy agent uses
  `coding` unless the user explicitly chooses a separate local/private policy.
- The session leaves a coherent set of starter docs and config behind.
- Tests cover command wiring and prompt/resource selection.
