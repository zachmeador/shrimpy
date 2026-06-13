# CTX-010: Agent Watch Inventory In Turn Context

Status: review
Priority: P2
Area: Context
Depends On: none

## Why
Agents should know their own standing watches without having to rediscover them from scratch. In a recent run, the agent correctly used `shrimpy watches add --help` and `shrimpy watches list`, then learned it already had daily and weekly watches with next-run, last-run, and diagnostic state. That is useful turn context: it tells the agent what background duties exist, which ones recently ran, what is due next, and where to inspect details.

Current turn context only gives an aggregate gateway status such as "last watch run" and "next watch run" across runtime watches. That helps with global activity, but it does not answer "what watches do I own?" or "when did my specific watches last run?"

## Build
- Add a compact runtime turn-context item for the active agent's watches, backed by the same inspection model used by `shrimpy watches --agent <id>`.
- Include only agent-owned watches by default: id/local id, enabled/disabled state, trigger text, target channels, next run, last run status/time when present, active run when present, and diagnostic count or one short diagnostic summary for important failures.
- Keep the item concise and bounded. Show the nearest due and most recently run watches first, and cap the rendered list so many watches do not crowd out user/channel context.
- Point the `inspect` field at `shrimpy watches --agent <id>` and use per-watch detail commands in summaries only when necessary.
- Make `shrimpy context turn --agent <id>` and `shrimpy context sources run runtime:turn-context --agent <id>` show the same watch context the model receives.

## Boundaries
- Use Shrimpy's existing CLI-backed watch inspection path; do not teach agents to parse `agents/<id>/watches.json` or runtime state files directly for normal awareness.
- Do not add a new watch control plane or duplicate watch scheduling logic in context assembly.
- Keep global gateway watch recency separate from the agent-owned inventory. One says what the runtime has been doing; the other says what this agent is responsible for.
- Do not include full watch messages, command output, or long history in turn context. Link to `shrimpy watches history <agent-id>/<watch-id>` for details.

## Implementation Notes
- `src/context/turn/service.ts` currently builds `gateway:status` from `collectChannelActivity`, `loadChannelWatchClockSummary`, and `loadRuntimeWatchIds`.
- `src/watches/inspection.ts` already provides `inspectWatches(runtime, { agentId })`, including source path, owner/local ids, trigger text, target channels, expected wake, next run, active run, last run, diagnostics, and inspect commands.
- Prefer a focused helper such as `buildAgentWatchItems` beside `buildGatewayStatusItems`, so watch awareness remains a runtime turn-context producer.
- Related observability work: [CTX-008](later/ctx-008-runtime-context-producers.md) would make individual runtime producers CLI-renderable, and [CTX-009](later/ctx-009-context-trace-debug-view.md) would unify trace/debug views. This item should not wait on either unless the implementation naturally folds into them.
- [CLI-001](cli-001-bounded-agent-output.md) owns the output-side fix for the same habit: this inventory removes the routine reason for agents to run `shrimpy watches --json` at all.

## Done
- An agent's normal turn context includes a compact summary of its configured watches and recent run state.
- The summary is generated from the same inspection data as `shrimpy watches --agent <id>`.
- The turn-context preview commands show the watch inventory item.
- Tests cover no watches, multiple watches with next/last run ordering, diagnostics, disabled watches, and output bounding.
