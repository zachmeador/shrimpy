# 🦐 ONBOARD-001: New User Onboarding Session

Status: todo
Priority: P2
Area: Onboarding

## Why
First-run users currently land in `shrimpy setup init`, which produces baseline files but does not get them to a working agent. The onboarding flow should be a normal guided session run by the bundled `mechanic` agent ([ADMIN-001](admin-001.md)) that walks the user through provider/model wiring, initial agent shaping, and starter doc persistence.

## Build
- Add an onboarding entry point that launches a guided TUI session as the `mechanic` agent.
- Cover at minimum: getting the mechanic provider/model authenticated and reachable first, walking the user through their initial agent's identity and prompt, and persisting the resulting starter docs to the workspace.
- Start by asking for an OpenAI or Anthropic key when no capable hosted provider is configured. The mechanic should be available for big setup, repair, and coding tasks before the user is encouraged to make the main `shrimpy` agent local/private.
- Ask whether the user wants a chat surface at all, and if so which platform they prefer. Telegram is the first implemented option, but the flow should be shaped to add more surfaces later without rewriting the setup conversation.
- Include a short, consultative explainer for when to create a new agent or app-agent instead of using the default agent, a skill, a schedule, or a channel.
- Drive the flow from mechanic's setup skills/resources rather than embedding flow logic in code.
- Surface clear next steps when onboarding ends (where files landed, how to launch the agent normally).

## Boundaries
- Do not create a separate onboarding runtime or privileged agent species; the session is just mechanic in setup mode.
- Do not silently overwrite user-edited config or starter docs; mutations happen through explicit user actions.
- Keep `shrimpy setup init` as the minimal non-interactive baseline; the guided session is additive.

## Notes
- Depends on [ADMIN-001](admin-001.md): the mechanic agent and its setup skills/resources are the substrate this session runs on.
- Sibling to [DOCTOR-001](doctor-001.md): both are bounded mechanic-agent session entry points using the normal session model. Onboarding is the first-run/setup flavor; doctor is the repair flavor.
- Likely files: `src/cli.ts`, `src/setup.ts`, `src/setup/templates*`, `src/sessions/direct.ts`, and onboarding-specific prompt/skill resources under setup templates.
- Source musing: `docs/musings/framework-design.md` "Init Experience" section.
- Related musing: `docs/musings/app-habitats.md` covers the agents-as-apps/app-agent graduation idea that onboarding should explain in plain terms.

## Done
- A first-run user can reach a working agent through one guided session.
- The first working model path belongs to mechanic, with main-agent local model setup handled as a later preference.
- The session leaves a coherent set of starter docs and config behind.
- Tests cover command wiring and prompt/resource selection.
