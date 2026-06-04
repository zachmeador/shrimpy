# 🦐 SETUP-002: Provider and Model Policy Setup

Status: review
Priority: P1
Area: Setup
Depends On: [MODEL-001](model-001-user-configurable-model-policy.md)

## Why

The first launch path needs a deterministic step between workspace init and
agent-led onboarding. Before Shrimpy can hand the user to mechanic, setup should
get the required `coding` model policy authenticated, reachable, and recorded in
workspace config.

This is not the conversational onboarding flow. It is the boring setup layer
that makes the first guided session possible.

## Current State

- `shrimpy setup` inspects Pi-visible authenticated models through
  `state/pi/auth.json` and `state/pi/models.json` only when setup work is
  still needed.
- If the workspace already has a `modelPolicies.coding` candidate and the main
  agent's `context/` directory exists, setup exits without inspecting models,
  asking questions, changing config, or launching guided setup.
- If no working models are found and a TTY is available, setup can launch a Pi
  model setup session as `shrimpy` with missing models allowed and asks
  the user to use Pi's `/login` and `/model`.
- Setup creates a missing `modelPolicies.coding` entry from the selected
  available model, defaults an unset main `shrimpy` agent to
  `modelPolicy: "coding"`, and preserves existing policy entries.
- During setup, setup smoke-tests `coding` before guided setup. If `coding`
  exists but does not resolve, setup reports the failed candidates and only
  replaces it after explicit confirmation.
- Bare interactive `shrimpy` enters setup instead of opening the
  normal TUI when the workspace config is missing or no `coding` candidate is
  configured. Non-interactive bare `shrimpy` prints a `shrimpy setup` hint.
- After model policy setup succeeds, setup launches the existing setup skill
  session as `shrimpy` through `coding`. Mechanic handoff remains blocked on
  [ADMIN-001](admin-001.md), [MECH-002](mech-002-direct-mechanic-tui-command.md),
  and [ONBOARD-001](onboard-001.md).
- Tests cover bare root command detection, fresh setup,
  model setup continuation, setup no-op behavior, existing-policy
  preservation, confirmed replacement, and unresolved diagnostics.

## Build

- Extend `shrimpy setup` so it inspects Pi-visible provider auth, available
  models, and existing `modelPolicies`.
- If no resolvable `coding` policy exists, guide the user through provider auth
  and model selection using Pi-supported auth/model mechanisms where possible.
- Create or update `modelPolicies.coding` from the selected model candidate.
- Default the main `shrimpy` agent to `modelPolicy: "coding"` so normal users
  get a working Shrimpy agent immediately.
- Let users explicitly choose a separate policy such as `local`, including
  local/private candidates, but frame that as an advanced preference.
- Smoke-test policy resolution before launching any guided setup session:
  `coding` must resolve; any explicitly selected separate policy should resolve
  or fail with a clear diagnostic.
- Once model policy setup succeeds, hand off to [ONBOARD-001](onboard-001.md) when
  the mechanic onboarding flow is available, or launch the direct
  [MECH-002](mech-002-direct-mechanic-tui-command.md) command path for ordinary
  mechanic chat.
- Keep all written config inspectable and preserve existing user-edited policy
  entries unless the user explicitly asks to replace them.

## Boundaries

- Do not embed the full onboarding questionnaire in TypeScript. This item only
  owns auth, policy writing, policy validation, and launch/handoff.
- Do not hardcode a provider preference into runtime behavior. Examples and
  prompts can mention common hosted providers, but selection should come from
  Pi-visible auth/model availability and explicit user choice.
- Do not silently override an explicitly configured agent policy with `coding`.
  Setup may default an unset main agent to `coding`; model resolution should
  still honor explicit policy config.
- Do not require local inference for first setup.
- Do not overwrite existing model policies without showing what will change.

## Notes

- Related: [MODEL-001](model-001-user-configurable-model-policy.md) defines the
  policy schema, resolution order, and inspection commands this setup uses.
- Related: [ONBOARD-001](onboard-001.md) should start after this setup has
  produced a resolvable `coding` path.
- Related: [MECH-002](mech-002-direct-mechanic-tui-command.md) is the direct TUI
  chat command this flow can hand the user to after policy setup.
- Related: [SETUP-001](setup-001-macos-friendly-install-docs.md) covers
  platform-specific install/docs polish; this item covers the model setup
  behavior itself.
- Likely files: `src/setup/service.ts`, `src/setup/init.ts`, `src/commands/setup.ts`,
  `src/commands/models.ts`, setup templates, and model-policy config helpers.

## Done

- A fresh user can run `shrimpy setup`, authenticate/select one capable hosted
  model, get a resolvable `coding` policy, and have the main `shrimpy` agent
  default to it.
- A user who wants local/private everyday Shrimpy can choose a separate policy
  without blocking `coding` setup.
- Setup explains unresolved policy failures clearly and points to
  `shrimpy models` inspection commands.
- Existing model policies are preserved unless the user confirms replacement.
- Tests cover fresh setup, setup no-op behavior, existing-policy
  preservation, unresolved policy diagnostics, and handoff selection.
