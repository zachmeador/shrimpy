# MODEL-001: User-Configurable Model Policy

Status: review
Priority: P1
Area: Models

## Why

Shrimpy currently resolves a session model from CLI overrides, a restored local session model, or `agents[].model`. That is too small for the direction of the project.

Future Shrimpy setup should require the workspace to have a `coding` model policy with at least one concrete model candidate. The bundled mechanic/admin path, setup, repair, and coding-worker flows need that policy before Shrimpy can do serious work. Many users will also use `coding` as their normal Shrimpy default. Others may add policies such as `local` for cheaper, local, or private everyday work.

- Heavy development, repair, mechanic, and coding-worker work should use the required `coding` policy.
- Normal agent work, app control, agent-owned watches, and ambient channel handling should use the selected agent's configured `modelPolicy`, falling back to `coding` only when the agent has no explicit policy.
- Users should be able to keep separate policies such as `local` by listing only the candidates they want. If an agent explicitly points at such a policy and no listed candidate is usable, fresh sessions should fail clearly instead of silently using `coding`.
- Direct TUI sessions should remain session-resumable. If a user explicitly switches a TUI session to a concrete model such as `openai/gpt5.5` or `anthropic/claudeopus`, reopening that session with no model override should resume the saved concrete model.

This should be user-owned policy, not hardcoded provider preference and not an agent prompt convention.

## Current State

- Config supports top-level `modelPolicies` and per-agent `modelPolicy`. If `modelPolicies` is present, it must include `coding` and every policy must contain at least one candidate.
- Concrete `agents[].model` defaults are removed from current config. Agent add/set commands use `--model-policy <name>`.
- `shrimpy models`, `shrimpy models resolve`, and `shrimpy models policies ...` inspect and mutate policy state in human and JSON forms.
- Direct local sessions restore a saved concrete session model when no concrete model or policy override is supplied. Gateway sessions resolve from the agent's model policy for the gateway process.
- Session metadata records model-policy resolution facts, and model switches remain visible `shrimpy_model_switch` custom messages.
- TUI model switching is session-local. Policy editing is CLI-first in this slice; richer TUI policy editing remains a later convenience wrapper.

## Concept

Add named model policies that map a user-owned policy name to an ordered set of concrete model candidates. `coding` is the required workspace policy. Other policy names have no built-in meaning; they are just user-owned names such as `local`, `private`, or `cheap`.

A fresh session resolves a policy against the Pi model registry and auth state. Shrimpy selects the first usable candidate and records both the selected model and the policy source in session metadata. Existing direct local sessions may instead resume their recorded concrete session model when the user did not pass a model or policy override.

Minimum first-run shape:

```json
{
  "modelPolicies": {
    "coding": {
      "candidates": [
        { "provider": "openai", "id": "gpt5.5" }
      ]
    }
  },
  "agents": [
    { "id": "mechanic", "modelPolicy": "coding" },
    { "id": "shrimpy", "modelPolicy": "coding" }
  ]
}
```

Example split setup:

```json
{
  "modelPolicies": {
    "coding": {
      "candidates": [
        { "provider": "openai", "id": "gpt5.5" },
        { "provider": "anthropic", "id": "claudeopus" }
      ]
    },
    "local": {
      "candidates": [
        { "provider": "local", "id": "qwen-coder" }
      ]
    }
  },
  "agents": [
    { "id": "mechanic", "modelPolicy": "coding" },
    { "id": "shrimpy", "modelPolicy": "local" }
  ]
}
```

The `local` policy is intentionally just a candidate list. "Local only" is not a separate runtime guess; it is enforced by what the user lists in that policy. A user can still explicitly switch an existing TUI session to another concrete available model without adding that model to `local`.

## Build

- Add top-level `modelPolicies` config with named policies and ordered concrete provider/model candidates.
- Require `modelPolicies.coding.candidates` to contain at least one candidate. Setup and inspection should also report whether at least one `coding` candidate is currently usable.
- Replace the agent default model field with an agent default model policy, for example `agents[].modelPolicy`.
- Treat `coding` as the command default for setup, mechanic, repair, admin, and coding-worker sessions.
- Use an agent's configured `modelPolicy` for normal fresh agent sessions, channel sessions, app control, watches, and ambient channel handling. If an agent has no explicit `modelPolicy`, use `coding` as the workspace default.
- Make setup require a resolvable `coding` policy before guided setup, mechanic repair, and worker/coding flows are considered available.
- During first setup, after `coding` resolves, default the main Shrimpy agent to `modelPolicy: "coding"` so the normal path yields a working agent. Ask before creating a separate local/private policy such as `local`, and frame that as an advanced preference.
- If an agent explicitly points at an unresolved policy or a policy with only unusable candidates, fresh sessions should fail with a clear "configure model policy <name>" message rather than silently using `coding`.
- Keep explicit CLI `--provider`/`--model` overrides as the highest-precedence one-session escape hatch.
- Add an explicit `--model-policy <name>` CLI override for commands that open sessions.
- Rework model resolution precedence around policy:
  1. Explicit `--provider`/`--model`.
  2. Explicit `--model-policy`.
  3. Recorded concrete model for an existing direct local session, when no model or policy override was supplied.
  4. Agent default `modelPolicy`.
  5. Required workspace `coding` policy.
  6. Missing/unresolved model error.
- Resume a saved direct local TUI session model even when that concrete model is not a candidate in the agent's default policy. If the recorded model is no longer Pi-visible or lacks usable auth, fall back to policy resolution and report why the saved model was skipped.
- Update `/model` and Shrimpy's model selector guard so an interactive session can switch to any Pi-visible usable model. Show policy candidates/favorites first where useful, but do not treat policy membership as a hard guardrail for an explicit session-local model switch.
- Keep policy edits explicit. Switching the active session model should update session metadata, not mutate `modelPolicies`.
- Record model policy metadata in session files: effective policy name, selected provider/model, candidate that won, source (`cli`, `policy`, `saved-session`, or `session-switch`), and unresolved/skipped candidate reasons when available.
- Add CLI inspection before tool automation:
  - `shrimpy models policies`
  - `shrimpy models policies show <name>`
  - `shrimpy models resolve --policy <name>`
  - `shrimpy models resolve --agent <id> --session <name>`
  - `shrimpy models resolve --agent <id> --channel <name>`
- Include `--json` output for policy inspection so agents can debug why a policy did or did not resolve.
- Add CLI mutation commands before relying on TUI policy editing:
  - `shrimpy models policies set <name> --candidate <provider>/<model> ...`
  - `shrimpy models policies add-candidate <name> <provider>/<model> [--index <n>]`
  - `shrimpy models policies remove-candidate <name> <provider>/<model>`
  - `shrimpy models policies move-candidate <name> <provider>/<model> --index <n>`
  - `shrimpy agent add <id> --model-policy <name>`
  - `shrimpy agent set <id> --model-policy <name>`
- Extend the TUI `/model` menu as a later convenience wrapper around the same policy mutation behavior: add the current or selected model to a named policy, remove a candidate, and reorder candidates.
- Surface policy resolution in `shrimpy models` alongside provider availability and agent defaults.
- Update setup/onboarding docs and prompts so the required first model is framed as the `coding` policy first, then ask whether the main agent should use `coding` or a separate local/private policy.
- Update reference docs for config, runtime model resolution, and setup.
- Add focused tests for config validation, precedence, unresolved policies, saved-session model restore, CLI JSON output shapes, and CLI policy mutation.

## Boundaries

- Do not hardcode OpenAI, Anthropic, or local provider preference into Shrimpy. The examples can mention those providers, but the runtime should use the user's configured policy order.
- Do not silently override an explicitly configured agent `modelPolicy` with `coding`. `coding` is the default only when no more specific model or policy was selected or configured.
- Do not make model policy a hidden agent decision. Agents may request mechanic or coding-worker sessions through normal Shrimpy controls, but the framework resolves models from explicit user config.
- Do not make `/model` policy edits implicit side effects of switching the active session model. Policy membership and fallback-order changes should be deliberate menu actions.
- Do not force every concrete session model switch into a policy. A remembered TUI session model is session state.
- Do not infer "local" from provider names for enforcement in the first slice. Local-only behavior comes from what the user lists in the policy.
- Do not create a second model registry. Policies point at Pi-visible provider/model ids in `state/pi/models.json`.
- Do not carry a long-lived compatibility path for both `agents[].model` and `agents[].modelPolicy` unless the release plan explicitly asks for migration support.

## Notes

- Related: [ONBOARD-001](onboard-001.md) should use `coding` as the first working model path, then default the main Shrimpy agent to `coding` unless the user explicitly chooses a separate local/private policy.
- Related: [SETUP-002](setup-002-provider-model-policy-bootstrap.md) should own deterministic provider auth, policy writing, and the smoke-test step before mechanic-led onboarding starts.
- Related: [MECH-002](mech-002-direct-mechanic-tui-command.md) should launch mechanic through `coding` so setup, repair, and extension work has enough model capability.
- Related: [CODE-002](code-002-agentic-worker-sessions.md) should select worker models through the coding policy rather than each worker backend choosing its own default.
- Related: [CODE-001](code-001.md) can report external coding-agent availability separately from model policy availability.
- This fits the mechanic-agent direction in [../musings/mechanic-agent.md](../musings/mechanic-agent.md): mechanic gets first claim on the required `coding` policy during setup, while the everyday `shrimpy` agent can either use that same policy or a separate local/private policy.
- Later slices can add richer candidate selectors, tags, cost budgets, or watch-aware policy defaults. The first slice should stay concrete and inspectable: ordered candidate list in, selected provider/model or clear failure out.

## Done

- Workspace config supports named model policies with ordered provider/model candidates and requires `coding` whenever `modelPolicies` is present.
- Agents can name a default `modelPolicy` instead of a single concrete model.
- Session-opening commands and gateway sessions resolve models through explicit CLI concrete model overrides, explicit policy overrides, saved direct local session models, agent defaults, and the `coding` fallback in that order.
- Setup defaults the main Shrimpy agent to `coding` and creates a `coding` policy from the first discovered model when setup has a model candidate and no policy exists yet.
- Explicit local-only or unresolved agent policies fail clearly until a usable candidate exists.
- Saved TUI session model switches resume without requiring the saved model to be listed in the agent's default policy.
- CLI commands can inspect and mutate model policies and assign an agent `modelPolicy`.
- CLI inspection explains policy resolution and unresolved candidates in human and JSON forms.
- Normal agent/channel/watch sessions use the agent's default policy or `coding` fallback.
- Reference docs and generated add-agent guidance describe `coding`, optional user policies such as `local`, and session-local concrete model switching without hardcoded provider assumptions.
- Tests cover policy validation, precedence, missing policy behavior, saved-session restore, CLI policy mutation, setup seeding, and CLI output.

## Later Follow-Up

- TUI policy editing can wrap the same CLI mutation behavior later: assign the selected model to a named policy, remove candidates, and reorder candidates.
- SETUP-002 still owns guided provider selection, policy smoke testing, and the richer first-run choice between `coding` and optional local/private policies.
