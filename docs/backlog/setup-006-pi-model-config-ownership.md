# 🦐 SETUP-006: Pi Model Config Ownership

Status: review
Priority: P1
Area: Setup
Depends On: none

## Why

Pi already owns local model configuration through `models.json`, including Ollama, LM Studio, vLLM, OpenAI-compatible endpoints, provider `compat`, model-level `thinkingLevelMap`, and `compat.thinkingFormat`. Shrimpy should not carry a second provider-compatibility dialect or rewrite provider request payloads for model-specific quirks.

The target boundary is simple: Shrimpy may provide workspace-local setup convenience and policy selection, but Pi remains the authority for provider schema, compatibility names, thinking formats, and request payload shaping.

## Original State

- Shrimpy writes workspace-local Pi model state at `state/pi/models.json` through `src/setup/pi-model-registry.ts`.
- `shrimpy setup` and `shrimpy models providers add-openai-compatible` add local/OpenAI-compatible provider entries and can set the Shrimpy `coding` model policy.
- Shrimpy also has provider-request logic in `src/inference/params.ts` and wires it through session provider hooks, re-reading raw model entries to apply `baseModel`, sampler params, and thinking toggles.
- Pi's installed docs already describe local models and provider compatibility in `node_modules/@earendil-works/pi-coding-agent/docs/models.md`; Pi's `ModelRegistry` loads custom providers, merges model/provider `compat`, and surfaces Pi-compatible model objects.
- Recent local cleanup work may have introduced Shrimpy-specific thinking format names such as `chat-template-kwargs` and `top-level-enable-thinking`. Those should not become public Shrimpy API.

## Build

- Remove Shrimpy's provider request payload transform layer for model compatibility. Delete the Shrimpy-owned thinking-format parser and request rewriting from `src/inference/params.ts`, plus the session hook that applies it.
- Keep Shrimpy's setup writer only as a Pi `models.json` writer. It should write Pi-native fields: provider `baseUrl`, `api`, `apiKey`, `compat`, model `id`, `name`, `reasoning`, `thinkingLevelMap`, `input`, `contextWindow`, `maxTokens`, and `cost`.
- If Shrimpy keeps `shrimpy models providers add-openai-compatible`, make it a thin convenience command for common Pi-native fields. Advanced provider compatibility should pass through Pi's native `compat.thinkingFormat` values rather than inventing Shrimpy names.
- Remove any Shrimpy-specific `baseModel` alias feature unless Pi supports the field natively. A user-facing model id should be the provider model id Pi sends to the API, or this needs an upstream Pi feature before Shrimpy exposes it.
- Remove Shrimpy-owned sampler params such as `inference.params` unless Pi has a native place for them. Do not keep a Shrimpy-only model variant recipe layer.
- Update docs so local model configuration points to Pi-native `models.json` semantics. Shrimpy docs should explain workspace-local storage and policy selection, then link or summarize the Pi fields Shrimpy writes, including how a user keeps using Qwen through Pi-native `compat.thinkingFormat` values when needed.
- Update changelog text to say Shrimpy removed its provider compatibility layer and now writes Pi-native local model config.

## Boundaries

- Do not add backward compatibility for Shrimpy-specific thinking format names. If they only existed in unreleased local work, delete them outright. This must not remove Qwen support; Qwen remains available through Pi-native model config and Pi-native `compat.thinkingFormat` values.
- Do not keep duplicate Shrimpy names for Pi compatibility values. Use Pi's values exactly, including `qwen` and `qwen-chat-template` when the user explicitly chooses those Pi formats.
- Do not build a broad local-model preset catalog in Shrimpy. Pi owns provider compatibility; Shrimpy owns setup flow, policy selection, diagnostics, and workspace paths.
- Do not migrate user model files silently. If a released Shrimpy version shipped Shrimpy-only fields, report the exact stale fields and ask before editing user data.
- Keep model policy resolution and session planning in Shrimpy. This item is about provider/model config ownership, not removing Shrimpy's `modelPolicies` layer.

## Touches

- `src/setup/pi-model-registry.ts`
- `src/setup/model-access.ts`
- `src/commands/models.ts`
- `src/commands/catalog.ts`
- `src/sessions/pi-resources.ts`
- `src/inference/params.ts`
- `docs/reference/configuration.md`
- `docs/reference/cli.md`
- `docs/reference/compaction.md`
- `CHANGELOG.md`
- Model command, setup, session planning, and provider payload tests

## Done

- Shrimpy no longer defines provider compatibility or thinking format names that Pi already owns.
- `src/inference/params.ts` no longer rewrites provider payloads for local model aliases, sampler params, or thinking toggles.
- Session startup no longer installs a Shrimpy-owned provider request transform for model compatibility.
- `shrimpy models providers add-openai-compatible` writes only Pi-native model registry fields or is removed if it cannot stay thin.
- Shrimpy docs describe local model setup as workspace-local Pi `models.json` configuration plus Shrimpy model policy selection.
- A personal workspace can still use Qwen models by configuring Pi-native custom models directly or through a thin Shrimpy setup writer.
- Tests prove local model setup creates Pi-compatible provider/model entries, model policies resolve through Pi's `ModelRegistry`, and stale Shrimpy-only fields are not accepted as supported behavior.
