# 🦐 SETUP-002: Provider and Model Policy Setup

Status: review
Priority: P1
Area: Setup
Depends On: [MODEL-001](model-001-user-configurable-model-policy.md)

## Why

The first launch path needs a deterministic step between workspace init and the guided setup skill. Before Shrimpy can open that setup session, setup should get the required `coding` model policy authenticated, reachable, and recorded in workspace config.

This is not the conversational onboarding flow. It is the boring setup layer that makes the first guided session possible.

## Current State

- `shrimpy setup` inspects Pi-visible authenticated models through `state/pi/auth.json` and `state/pi/models.json` only when setup work is still needed.
- If the workspace already has a `modelPolicies.coding` candidate and the main agent's `context/` directory exists, setup exits without inspecting models, asking questions, changing config, or launching guided setup.
- If no working models are found and a TTY is available, setup can launch a Pi model setup session as `shrimpy` with missing models allowed and asks the user to use Pi's `/login` and `/model`.
- Setup creates a missing `modelPolicies.coding` entry from the selected available model, defaults an unset main `shrimpy` agent to `modelPolicy: "coding"`, and preserves existing policy entries.
- During setup, setup smoke-tests `coding` before guided setup. If `coding` exists but does not resolve, setup reports the failed candidates and only replaces it after explicit confirmation.
- Bare interactive `shrimpy` enters setup instead of opening the normal TUI when the workspace config is missing or no `coding` candidate is configured. Non-interactive bare `shrimpy` prints a `shrimpy setup` hint.
- After model policy setup succeeds, setup launches the existing setup skill session as `shrimpy` through `coding`. Mechanic handoff remains future work outside the current onboarding path.
- Tests cover bare root command detection, fresh setup, model setup continuation, setup no-op behavior, existing-policy preservation, confirmed replacement, and unresolved diagnostics.

## Build

- Extend `shrimpy setup` so it inspects Pi-visible provider auth, available models, and existing `modelPolicies`.
- If no resolvable `coding` policy exists, guide the user through provider auth and model selection using Pi-supported auth/model mechanisms where possible.
- Create or update `modelPolicies.coding` from the selected model candidate.
- Default the main `shrimpy` agent to `modelPolicy: "coding"` so normal users get a working Shrimpy agent immediately.
- Do not add a first-run separate local/private policy chooser in this item. Users can inspect or edit additional policies later with `shrimpy models`.
- Smoke-test `coding` before launching any guided setup session. Preserve any explicit separate agent policy in config, but do not let it block the setup skill session because that session explicitly runs through `coding`.
- Once model policy setup succeeds, hand off to [ONBOARD-001](onboard-001.md) by launching the default `shrimpy` agent with the setup skill and an explicit `coding` model policy.
- Keep all written config inspectable and preserve existing user-edited policy entries unless the user explicitly asks to replace them.

## Boundaries

- Do not embed the full onboarding questionnaire in TypeScript. This item only owns auth, policy writing, policy validation, and launch/handoff.
- Do not hardcode a provider preference into runtime behavior. Examples and prompts can mention common hosted providers, but selection should come from Pi-visible auth/model availability and explicit user choice.
- Do not silently override an explicitly configured agent policy with `coding`. Setup may default an unset main agent to `coding`; model resolution should still honor explicit policy config.
- Do not require local inference for first setup.
- Do not overwrite existing model policies without showing what will change.

## Notes

- Related: [MODEL-001](model-001-user-configurable-model-policy.md) defines the policy schema, resolution order, and inspection commands this setup uses.
- Related: [ONBOARD-001](onboard-001.md) should start after this setup has produced a resolvable `coding` path.
- Future mechanic work can reuse the setup skill after [ADMIN-001](admin-001.md) and [MECH-002](mech-002-direct-mechanic-tui-command.md) exist. The existing `src/skills/shrimpy-mechanic-ideas/` source skill is the draft mechanic guidance to draw from later.
- Related: [SETUP-001](setup-001-macos-friendly-install-docs.md) covers platform-specific install/docs polish; this item covers the model setup behavior itself.
- Likely files: `src/setup/service.ts`, `src/setup/init.ts`, `src/commands/setup.ts`, `src/commands/models.ts`, setup templates, and model-policy config helpers.

## Done

- A fresh user can run `shrimpy setup`, authenticate/select one capable hosted model, get a resolvable `coding` policy, and have the main `shrimpy` agent default to it.
- Existing separate agent policies are preserved, but first setup only requires the `coding` policy.
- Setup explains unresolved policy failures clearly and points to `shrimpy models` inspection commands.
- Existing model policies are preserved unless the user confirms replacement.
- Tests cover fresh setup, setup no-op behavior, existing-policy preservation, unresolved policy diagnostics, and handoff selection.
