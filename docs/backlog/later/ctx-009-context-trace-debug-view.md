# CTX-009: First-Class Context Trace Debug View

Status: todo
Priority: P2
Area: Context

## Why

Agents need a dependable answer to: "What do I know right now, why do I know it,
and where can I inspect the source?" Shrimpy already has the shape of this in
`ContextBlock`, but session prompt sections, turn context items, and CLI source
inspection still flow through separate paths.

Make context assembly inspectable as one deterministic trace:

```text
source config -> resolved source plan -> produced context blocks -> rendered prompt/turn context -> provider-facing injected turn
```

The inspection view should match the actual material used for the prompt and
turn context, so agents and developers can trust `shrimpy context` output when
debugging a session. The trace should keep four artifacts distinct: stable
system prompt, ephemeral turn context, durable user message, and the
provider-facing message sequence after Pi's context hook has injected the
ephemeral context.

This is lowest-priority observability work. Build it only when context
provenance becomes a recurring debugging problem, or when continuation, watch,
and worker-status context expands enough that the existing
`shrimpy context --sections`, `shrimpy context turn`, and
`shrimpy context sources list/run` surfaces are no longer sufficient.

## Build

- Add a normalized `ContextTrace` or `ContextPlan` layer for a resolved session
  and optional turn.
- Represent each produced block with stable metadata: `id`, `scope`, `kind`,
  body or summary, provenance, freshness/cache state, inspect command, and
  materialization status.
- Represent continuation context with enough provenance to explain the source
  message, source record, message channel, wake decision, and related
  watch/worker id without treating it as a special prompt side channel.
- Render existing `PromptSection` and `TurnContextItem` outputs from the trace
  instead of treating them as separate source systems.
- Make `shrimpy context --sections`, `shrimpy context turn`, and
  `shrimpy context sources list/run` read from the same trace model.
- Include the durable user message and provider-facing injected context view in
  turn traces, without persisting the injected context as a transcript message.
- Keep command and runtime producers explicitly inspectable without duplicating
  execution logic in the CLI.

## Boundaries

- Do not create a second prompt assembly path.
- Do not make the trace a persistent memory store or control plane.
- Keep planning separate from materialization, so list/section views do not
  accidentally execute command sources or mutate turn context freshness state.
- Preserve stable prompt resources as session context and live facts as turn
  context.
- Preserve the stable session-context boundary: trace/debug views may show
  provider-facing injected context, but they must not turn it back into durable
  prompt text.
- Do not add legacy compatibility paths unless a concrete workspace-facing break
  requires it.

## Notes

- This overlaps with CTX-008. CTX-008 may become the runtime-producer slice of
  this work, or be folded into this item when implementation starts.
- Likely files: `src/context/source.ts`, `src/context/assembly.ts`,
  `src/context/turn/service.ts`, `src/context/resources.ts`,
  `src/commands/context.ts`, and `src/sessions/prompt.ts`.
- This should make future turn-context facts easier to add because new facts can
  be introduced as trace producers with provenance and inspection metadata.
- Related: active channel wake guidance lives in
  [channels.md](../../reference/channels.md).

## Done

- Context source resolution, block materialization, prompt rendering, turn
  context rendering, provider-facing turn injection preview, and CLI inspection
  share one trace model.
- JSON output exposes the trace with source plan, produced blocks, render
  targets, provenance, freshness/cache status, inspect commands, and skipped or
  failed source statuses.
- Continuation-related trace entries point back to channel messages and their
  source records.
- Existing text output remains compact and agent-friendly.
- Tests cover prompt/trace parity, turn context/trace parity, source listing,
  source rendering, command freshness behavior, and skipped/failed sources.
