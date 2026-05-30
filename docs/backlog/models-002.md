# 🦐 MODELS-002: Unified Model Config Boundary and Capability Selection

Status: todo
Priority: P1
Area: Models
Depends On: [MODELS-001](models-001.md)

## Why
Shrimpy currently has too many places that can influence model behavior, and the effective boundary is hard to reason about. Explicit provider/model ids are simple and inspectable, but the selection path is scattered across workspace config, agent config, CLI flags, Pi's model registry, session startup, gateway runtime construction, model-variant inference metadata, and Pi's own first-available fallback.

Before adding a model capability abstraction, Shrimpy needs one model-resolution boundary that can explain what was requested, where it came from, which concrete Pi model was selected, what inference metadata applies, and whether a session must be reopened to pick up a changed model config.

Capability-based selection and fallback should then plug into that boundary, not become another model-routing control plane. Users should be able to describe intent such as "use a medium-or-better model" while keeping the concrete provider stack explicit, ordered, and inspectable.

## Current Model Selection Points
- `state/pi/models.json` defines Pi-visible providers and models, including provider `baseUrl`, API compatibility, model metadata, model-level `thinkingLevelMap`, Shrimpy `baseModel` rewrites, and inference params. Pi tolerates `//` comments and trailing commas in this file before validating it as JSON.
- `state/pi/models.json` provider `apiKey` and `headers` can resolve environment variables and shell commands. The resolver should report whether credentials came from stored Pi auth, environment, literal config, or command-backed config without executing slow command-backed values just for inspection.
- `config/shrimpy.json` top-level `model` is the workspace default.
- `config/shrimpy.json` `agents[].model` overrides the workspace default for that agent.
- CLI flags such as `--provider` and `--model` override configured defaults for direct `run` and TUI sessions.
- `config/shrimpy.json` and session commands also carry `thinking`, which is adjacent to model behavior and should have an explicit relationship to model selection and inference metadata.
- Direct `run` and TUI session paths each resolve model defaults and model-variant inference before opening a session.
- Gateway/channel sessions resolve the model when the gateway constructs each agent channel runtime, so config changes require restarting the gateway or reopening affected sessions.
- Session prompt assembly currently falls back to Pi's first available registry model if Shrimpy did not pass a resolved model.
- Session inspection paths can independently use the first available registry model when computing effective compaction policy.
- Surface settings such as Telegram `defaultAgentId` choose the agent; the selected agent then determines which model default applies.

## Build
- Define the supported model-control surfaces and write down the precedence: one-shot CLI override, agent default, workspace default, then explicit Shrimpy fallback to Pi registry order.
- Move all model selection, fallback, model-variant inference lookup, and model-selection diagnostics behind one resolver API.
- Have the resolver return a structured plan with the requested selection, source, concrete Pi model, inference metadata, thinking/default-thinking context, and diagnostics.
- Have the resolver preserve Pi model capability metadata such as `thinkingLevelMap`, and keep any Shrimpy-only raw metadata (`baseModel`, `inference`) attached to the selected raw model entry for provider-request rewriting.
- Use that resolver from direct `run`/TUI sessions, gateway/channel sessions, session/status inspection, and any compaction-policy preview that needs a model context.
- Remove implicit first-available fallback from prompt assembly; if first-available is the intended fallback, it should be chosen and labeled by the resolver before session open.
- Record the resolver plan in session metadata so stale sessions can be diagnosed against current config.
- Make commands/status show the requested model, resolved concrete model, selection source, applied inference metadata, and whether the active session was opened with stale model config.
- After the boundary is unified, extend model entries in `state/pi/models.json` with optional Shrimpy selection metadata, for example `capability: "low" | "medium" | "high"` and an explicit fallback/order field if needed.
- Do not reintroduce older `compat.reasoningEffortMap`-style metadata. Model-specific thinking controls should use Pi's current model-level `thinkingLevelMap`.
- Allow `config/shrimpy.json` model selections to target a capability requirement without losing support for exact provider/model selections.
- Resolve capability selections through the unified resolver before sessions are opened, returning a normal Pi model object.
- Check model availability with a bounded health probe before selecting a fallback, and cache failures briefly so an unavailable local endpoint does not stall every turn.
- Prefer local/configured ordering when multiple models satisfy the same capability.
- Keep variant metadata (`baseModel`, `inference`) attached to the concrete selected model entry.

## Boundaries
- Do not replace explicit provider/model selection. Exact ids must remain the most predictable path.
- Do not create a separate inference preset, routing, or surface-specific model control plane; capability selection should resolve into the existing session model path.
- Do not let surfaces configure models directly. Surfaces select/address agents; agents and session overrides determine model defaults.
- Do not treat Pi's implicit first-available behavior as the Shrimpy policy. Shrimpy should label any fallback it depends on.
- Do not silently downgrade below the requested capability unless the config explicitly permits it.
- Do not hide provider failures. Surface the attempted stack and final selected model in diagnostics.
- Avoid per-token or mid-session switching. A session should open with one resolved concrete model until it is reset/reopened.

## Done
- There is one model-resolution module/API used by direct sessions, gateway sessions, model/status inspection, and compaction-policy previews.
- The supported model-control surfaces and precedence are documented and reflected in code.
- Session metadata records the requested selection, source, concrete resolved model, and applied inference metadata.
- Diagnostics can explain why a model was selected, which config surface supplied it, and when an active session must be reopened for model config changes.
- Workspace and agent config can select either an exact model or a capability requirement.
- Gateway, TUI, and one-shot runs share the same capability resolver.
- A configured `medium` local Qwen model can fall back to an OpenAI model when its endpoint is unavailable.
- Commands or diagnostics show why a model was selected and which candidates failed.
- Tests cover exact model precedence, CLI override precedence, agent override precedence, workspace default precedence, first-available fallback labeling, model-variant inference attachment, stale-session diagnostics, capability threshold matching, fallback ordering, health-probe failure, and no-downgrade behavior.
