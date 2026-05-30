# 🦐 MODELS-001: Provider-Supported Inference Params

Status: done
Priority: P1
Area: Models

## Why
Reasoning level exists, but provider-supported inference params such as `temperature` need one resolved configuration layer. Shrimpy treats GGUF task recipes as model variants, so users select the recipe through the normal model picker and agent model defaults.

## Build
- Resolve Shrimpy model-variant metadata from the selected `state/pi/models.json` model entry.
- Keep workspace and agent config on the existing `model` object; do not add a separate inference preset control plane.
- Pass selected OpenAI-compatible sampler params through Pi's provider payload hook.
- Support user-facing variant ids that rewrite to the loaded GGUF `baseModel` at request time.

## Boundaries
- Do not invent unsupported provider parameters.
- Do not bypass Pi's model/provider abstractions unless Pi is the specific constraint.

## Done
- Model variants are normal Pi-visible model choices.
- Session creation applies selected model metadata.
- Tests cover model metadata lookup, alias normalization, payload application, base-model rewrite, and Qwen thinking template injection.
