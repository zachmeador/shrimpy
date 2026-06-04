# MODEL-001: User-Configurable Model Policy

Status: draft
Priority: P1
Area: Models

## Why

Shrimpy currently resolves a session model from CLI overrides, a restored local
session model, or `agents[].model`. That is too small for the direction of the
project.

Future Shrimpy setup should require the user to provide at least one
coding-tier model so the bundled mechanic/admin path can do serious setup,
repair, and development work. Most normal users will also use that same capable
hosted model for everyday Shrimpy work. Some users may later split everyday
home-agent work onto a cheaper, local, or private model. Those cases need
different behavior:

- Heavy development, repair, and mechanic work should use a ranked capable
  chain such as `openai/gpt5.5`, then `anthropic/claudeopus`, then a local
  fallback.
- Normal home-agent work, app control, agent-owned watches, and ambient channel handling
  should resolve through a user-owned `home` policy. First setup should normally
  create a working `home` policy from the same hosted candidate as `coding` so a
  new user can talk to Shrimpy immediately.
- Advanced users should still be able to make `home` say "local model or bust"
  by listing only local/private candidates. In that case, normal home sessions
  should fail clearly when no listed candidate is usable.

This should be user-owned policy, not hardcoded provider preference and not an
agent prompt convention.

## Current State

- Config still supports concrete `agents[].model` defaults, not
  `modelPolicies` or `agents[].modelPolicy`.
- `shrimpy models` and `shrimpy models resolve` inspect current concrete model
  availability and precedence in human and JSON forms.
- Direct local sessions restore a saved session model when no CLI override is
  supplied. Gateway sessions use the agent default for the gateway process.
- Saved-session model restore is not constrained by a policy because policy
  resolution does not exist yet.
- Model switches are recorded as visible `shrimpy_model_switch` custom
  messages, but session metadata does not include model-policy facts.

## Concept

Add named model policies that map a session intent to an ordered set of concrete
model candidates. A policy is resolved at session start against the Pi model
registry and auth state. Shrimpy selects the first usable candidate and records
both the selected model and the policy source in session metadata.

Normal first-run shape:

```json
{
  "modelPolicies": {
    "coding": {
      "candidates": [
        { "provider": "openai", "id": "gpt5.5" },
        { "provider": "anthropic", "id": "claudeopus" },
        { "provider": "local", "id": "qwen-coder" }
      ]
    },
    "home": {
      "candidates": [
        { "provider": "openai", "id": "gpt5.5" }
      ]
    }
  },
  "agents": [
    { "id": "mechanic", "modelPolicy": "coding" },
    { "id": "shrimpy", "modelPolicy": "home" }
  ]
}
```

The `home` policy is intentionally just a candidate list. For the default setup
path, it may contain the same hosted candidate as `coding`. For a local/private
setup, it can contain only local candidates. "Local only" is not a separate
runtime guess; it is enforced by the absence of hosted candidates. If a user
chooses a local-only `home` policy and has not added a usable local model,
normal home sessions should fail with an actionable message.

## Build

- Add top-level `modelPolicies` config with named policies and ordered concrete
  provider/model candidates.
- Replace the agent default model field with an agent default model policy, for
  example `agents[].modelPolicy`.
- Add a session intent field to the model resolution path. Initial standard
  intents should include:
  - `coding` for heavy development work, coding workers, and codebase changes.
  - `maintenance` or `mechanic` for setup, repair, admin, and direct mechanic
    sessions.
  - `home` for the default Shrimpy agent, app control, agent-owned watches, and
    normal channel handling.
- Start by treating `maintenance`/`mechanic` as an alias/default to `coding`
  unless a clear product need for a separate model policy appears.
- Make setup require a resolvable coding-tier policy before guided setup,
  mechanic repair, and worker/coding flows are considered available.
- During first setup, after `coding` resolves, default `home` to the same
  provider/model candidate so the normal path yields a working Shrimpy agent.
  Ask before creating a separate `home` policy, and frame local/private home
  inference as an advanced preference.
- If the user explicitly leaves `home` unresolved or configures `home` with only
  unusable candidates, normal home sessions should fail with a clear
  "configure a home model policy" message rather than silently using `coding`.
- Keep explicit CLI `--provider`/`--model` overrides as the highest-precedence
  one-session escape hatch.
- Add an explicit `--model-policy <name>` CLI override for commands that open
  sessions.
- Rework model resolution precedence around policy:
  1. Explicit `--provider`/`--model`.
  2. Explicit `--model-policy`.
  3. Session intent default.
  4. Agent default `modelPolicy`.
  5. Missing/unresolved model error.
- Only restore a saved local TUI session model when it is still allowed by the
  effective policy. If the policy changed or no longer allows the recorded
  model, resolve the policy again.
- Update `/model` and Shrimpy's model selector guard so an interactive session
  shows policy-allowed candidates by default and makes policy changes explicit.
- Record model policy metadata in session files: effective policy name, selected
  provider/model, candidate that won, and unresolved/skipped candidate reasons
  when available.
- Add CLI inspection before tool automation:
  - `shrimpy models policies`
  - `shrimpy models policies show <name>`
  - `shrimpy models resolve --policy <name>`
  - `shrimpy models resolve --intent <coding|maintenance|home> ...`
- Include `--json` output for policy inspection so agents can debug why a
  policy did or did not resolve.
- Surface policy resolution in `shrimpy models` alongside provider availability
  and agent defaults.
- Update setup/onboarding docs and prompts so the required first model is
  framed as the coding/maintenance policy first, then ask whether the same
  model should power everyday Shrimpy.
- Update reference docs for config, runtime model resolution, and setup.
- Add focused tests for config validation, precedence, unresolved policies,
  saved-session policy compatibility, and CLI JSON output shapes.

## Boundaries

- Do not hardcode OpenAI, Anthropic, or local provider preference into Shrimpy.
  The examples can mention those providers, but the runtime should use the
  user's configured policy order.
- Do not silently escalate normal home/app/channel work to the coding policy
  when the home policy is unresolved. Setup may explicitly copy the selected
  coding candidate into `home`, but runtime resolution should not guess.
- Do not make model policy a hidden agent decision. Agents may request a session
  or worker intent through normal Shrimpy controls, but the framework resolves
  models from explicit user config.
- Do not infer "local" from provider names for enforcement in the first slice.
  Local-only behavior comes from what the user lists in the policy.
- Do not create a second model registry. Policies point at Pi-visible
  provider/model ids in `state/pi/models.json`.
- Do not carry a long-lived compatibility path for both `agents[].model` and
  `agents[].modelPolicy` unless the release plan explicitly asks for migration
  support.

## Notes

- Related: [ONBOARD-001](onboard-001.md) should use the coding/maintenance
  policy as the first working model path, then default `home` to the same
  hosted candidate unless the user explicitly chooses a separate local/private
  path.
- Related: [SETUP-002](setup-002-provider-model-policy-bootstrap.md) should own
  the deterministic provider auth, policy writing, and smoke-test step before
  mechanic-led onboarding starts.
- Related: [MECH-002](mech-002-direct-mechanic-tui-command.md) should launch
  mechanic through the maintenance or coding policy so setup, repair, and
  extension work has enough model capability.
- Related: [CODE-002](code-002-agentic-worker-sessions.md) should select worker
  models through the coding policy rather than each worker backend choosing its
  own default.
- Related: [CODE-001](code-001.md) can report external coding-agent
  availability separately from model policy availability.
- This fits the mechanic-agent direction in
  [../musings/mechanic-agent.md](../musings/mechanic-agent.md): mechanic gets
  first claim on a capable hosted model during setup, while the everyday
  `shrimpy` agent can either use that same hosted model or stay local/private.
- Later slices can add richer candidate selectors, tags, cost budgets, or
  watch-aware intents. The first slice should stay concrete and inspectable:
  ordered candidate list in, selected provider/model or clear failure out.

## Done

- Workspace config supports named model policies with ordered provider/model
  candidates.
- Agents can name a default model policy instead of a single default model.
- Session-opening commands and gateway sessions resolve models through explicit
  CLI overrides, explicit policy overrides, session intent, and agent defaults
  in that order.
- Setup requires and validates a resolvable coding-tier policy.
- Setup normally creates a resolvable `home` policy by copying the selected
  coding candidate, while explicit local-only or unresolved `home` policies fail
  clearly until a usable home candidate exists.
- Saved TUI session models cannot bypass the effective policy.
- CLI inspection explains policy resolution and unresolved candidates in human
  and JSON forms.
- Worker/coding, mechanic/setup/repair, and normal home sessions use distinct intents.
- Docs explain the normal "one hosted model for setup and home" path plus the
  advanced "hosted frontier fallback for coding" and "local or bust for home"
  path without hardcoded provider assumptions.
- Tests cover policy validation, precedence, unresolved home policy behavior,
  saved-session compatibility, and CLI output.
