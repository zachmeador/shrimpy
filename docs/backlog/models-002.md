# 🦐 MODELS-002: Agent Model Defaults and Resolution Inspection

Status: done
Priority: P1
Area: Models
Depends On: none

## Why
Shrimpy had too many places that could influence model behavior, and the effective boundary was hard to reason about. Model defaults could come from workspace config, agent config, session-scoped state, CLI flags, Pi's model registry, session startup, gateway runtime construction, prompt assembly, and narrowly allowed bootstrap fallback.

The intended boundary is simpler: an agent owns its default exact provider/model selection. CLI flags can override it for one-shot/local use, local sessions can restore a recorded model when reopened, and gateway/channel sessions resolve from the current agent default when the gateway constructs the runtime. Surfaces choose agents; they do not choose models.

`shrimpy context` should not render session-scoped provider/model metadata into the prompt environment. That metadata can remain available for inspection, but it should not appear as part of the prompt unless it is deliberately added as prompt content.

## Current Model Selection Points
- `state/pi/models.json` defines Pi-visible providers and models, including provider `baseUrl`, API compatibility, model metadata, model-level `thinkingLevelMap`, Shrimpy `baseModel` rewrites, and inference params. Pi tolerates `//` comments and trailing commas in this file before validating it as JSON.
- `config/shrimpy.json` has no top-level workspace model. `agents[].model` is the persistent default for sessions opened as that agent, and it must name both `provider` and `id`.
- CLI flags such as `--provider` and `--model` override configured defaults for direct `run`, TUI, and context-preview commands that accept model overrides.
- Direct `run` and TUI session paths can restore a saved session model when no CLI override is provided. Otherwise they resolve the agent default before opening a session.
- Gateway/channel sessions resolve from the agent default when the gateway constructs each agent channel runtime. Config changes require restarting the gateway or reopening affected sessions; a recorded session model is diagnostic, not the gateway's restart default.
- Setup/bootstrap paths may explicitly allow missing defaults or first-available registry fallback, but normal prompt assembly and session inspection report missing agent defaults instead of independently substituting the first registry model.
- Surface settings such as Telegram `defaultAgentId` choose the agent; the selected agent then determines which model default applies.

## Build
- Remove top-level `config.model` support. A raw workspace-level model key is an error that tells the user to move the selection to `agents[].model`.
- Require `provider` in configured model selections so agent defaults are exact and inspectable.
- Define and document model precedence: CLI override, restorable local session model, agent default, and then only explicitly allowed bootstrap fallback.
- Centralize exact model resolution enough for current callers to share missing-default behavior, registry validation, model-only lookup, local session restore, and bootstrap allowances.
- Use the shared resolution path from direct `run`/TUI sessions, gateway/channel sessions, context preview, session/status inspection, setup/bootstrap, and compaction-policy preview.
- Remove implicit first-available fallback from prompt assembly. If first-available fallback is allowed, choose it before session open in a labeled setup/bootstrap path.
- Add `shrimpy models` for agent-default and registry inspection.
- Add `shrimpy models resolve` for explaining the effective model for an agent, channel session, named session, or one-shot override.
- Keep session-scoped `provider` and `model_id` metadata out of rendered `shrimpy context` prompt text.
- Update docs and tests for the new boundary.

## Boundaries
- Do not replace explicit provider/model selection. Exact ids must remain the most predictable path.
- Do not add an intent-based routing layer or automatic failover policy in this item.
- Do not create a separate inference preset, routing, or surface-specific model control plane.
- Do not reintroduce workspace default model config.
- Do not let surfaces configure models directly. Surfaces select/address agents; agents and session overrides determine model defaults.
- Do not treat Pi's implicit first-available behavior as the normal Shrimpy policy. Shrimpy should label any bootstrap fallback it depends on.
- Avoid per-token or mid-session switching. A session should open with one resolved concrete model until it is reset/reopened.

## Done
- Agent defaults are the only persistent model selection in `config/shrimpy.json`.
- Sessions without an agent default fail clearly unless the caller explicitly allows missing/default bootstrap behavior.
- Direct local sessions can restore a recorded model; gateway/channel sessions resolve from the agent default on runtime construction.
- `shrimpy models` lists agent defaults, registry models, and configuration problems.
- `shrimpy models resolve` explains CLI override, local session restore, channel-session diagnostics, and effective agent defaults.
- `shrimpy context` no longer renders `model_id` or `provider` as prompt runtime environment fields.
- Tests cover CLI override precedence, restorable local session precedence, agent default precedence, missing-default errors, explicit bootstrap fallback labeling, gateway/channel resolution diagnostics, and context prompt exclusion.
