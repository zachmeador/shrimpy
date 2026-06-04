# 🦐 ONBOARD-001: New User Onboarding Session

Status: review
Priority: P2
Area: Onboarding
Depends On: [MODEL-001](model-001-user-configurable-model-policy.md), [SETUP-002](setup-002-provider-model-policy-bootstrap.md)

## Why

First-run users should be able to install Shrimpy, run bare `shrimpy`, enter provider auth/API-key details and choose a model, then land in a guided setup TUI.

For now, keep onboarding shrimple: after provider/model bootstrap, launch the default `shrimpy` agent in a `setup` session with the `setup` skill. That session must explicitly use `modelPolicy: "coding"` so first setup does not depend on any future specialist-agent behavior.

Mechanic/admin agent work can come later as normal agent packaging. It is not a prerequisite for the current onboarding flow.

## Current State

- `shrimpy setup init` remains the minimal baseline file creation path.
- Bare interactive `shrimpy` enters setup when config is missing or no `coding` candidate is configured.
- `shrimpy setup` initializes files when needed, sets up `modelPolicies.coding`, can launch a Pi model setup TUI for `/login` and `/model`, and no-ops once a `coding` candidate and agent `context/` exist.
- After model policy setup succeeds, setup launches an interactive session as `shrimpy` with `channel: "setup"`, `sessionType: "tui"`, `skills: ["setup"]`, and `modelPolicy: "coding"`.
- The setup skill lives under `agents/shrimpy/skills/setup/` and includes a validator script.
- There is no bundled mechanic handoff in this flow.

## Build

- Keep bare `shrimpy` the first-run front door: missing setup should collect auth/API-key details and a model first, then launch the guided setup session.
- Require the setup session to run as the default `shrimpy` agent through the `coding` model policy.
- Drive the user-facing flow from the setup skill rather than embedding the full onboarding questionnaire in TypeScript.
- Ask only a small number of file-changing questions during first setup: what to call the user, what the default Shrimpy agent should be like, whether to add a chat surface now, whether Shrimpy may inspect paths outside the official workspace, and whether to leave scheduled background tasks enabled or pause them.
- Ask whether the user wants a chat surface at all, and if so which platform they prefer. Telegram is the first implemented option, but the flow should be shaped to add more surfaces later without rewriting the setup conversation.
- Include a short, consultative explainer for when to create a new agent or app-agent instead of using the default agent, a skill, an agent-owned watch, or a channel.
- Surface clear next steps when onboarding ends: where files landed and how to launch the agent normally.
- Leave mechanic/admin agent onboarding to future backlog work.

## Boundaries

- Do not create a separate onboarding runtime or privileged agent species.
- Do not require a bundled `mechanic` agent or `shrimpy mechanic` command for first setup.
- Do not silently overwrite user-edited config or starter docs; mutations happen through explicit user actions.
- Keep `shrimpy setup init` as the minimal non-interactive baseline; the guided session is additive.

## Notes

- Depends on [MODEL-001](model-001-user-configurable-model-policy.md): onboarding should create or validate `coding` first.
- Depends on [SETUP-002](setup-002-provider-model-policy-bootstrap.md): deterministic provider auth and model policy setup complete before the guided setup conversation starts.
- Future mechanic work can reuse or wrap the same setup skill through ordinary agent primitives, using the draft `shrimpy-mechanic-ideas` source skill as input, when [ADMIN-001](admin-001.md) and [MECH-002](mech-002-direct-mechanic-tui-command.md) are ready.
- Likely files: `src/cli.ts`, `src/setup/init.ts`, `src/setup/service.ts`, `src/setup/templates*`, `src/sessions/direct.ts`, and setup skill resources under setup templates.
- Source musing: `docs/musings/framework-design.md` "Init Experience" section.
- Related musing: `docs/musings/app-habitats.md` covers the agents-as-apps/app-agent graduation idea that onboarding should explain in plain terms.

## Done

- A first-run user can reach a working agent through one guided setup skill session.
- A fresh install followed by bare `shrimpy` collects auth/model details and launches the setup TUI without requiring the user to know subcommands.
- The first working model path is `coding`, and the setup session explicitly requires `modelPolicy: "coding"`.
- The session leaves a coherent set of starter docs and config behind.
- Tests cover command wiring and setup session config selection.
