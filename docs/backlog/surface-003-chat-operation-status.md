# 🦐 SURFACE-003: Chat Compaction Failure Status

Status: todo
Priority: P2
Area: Surfaces
Depends On: none

## Why

Routine session compaction is internal working-context maintenance and should stay quiet. A terminal compaction failure is different: it can prevent the active chat turn from completing and gives the user a concrete reason for an otherwise unexplained failure.

Shrimpy already has typed `operation_status` channel messages, channel-outbox delivery, Telegram rendering of status text, and session compaction events. This item only connects a terminal gateway-session compaction failure to that existing path.

## Build

- Observe `compaction_end` for channel-delivered gateway sessions.
- Publish one failed `operation_status` only when compaction ends with an error and Pi will not retry it.
- Stamp `operation: "compaction"`, `ok: false`, and the target agent id, with concise text that says compaction failed and points repeated failures toward `shrimpy sessions compaction <session-id> --agent <id>` and gateway logs.
- Deliver the status through the existing channel outbox so Telegram and future adapters receive the same durable status record.
- Log publication or delivery failures without replacing or obscuring the underlying compaction error.

## Boundaries

- Do not emit routine compaction-start or compaction-success chat messages.
- Do not emit a failure while Pi reports that it will retry.
- Do not expose summary content, prompts, token counts, provider payloads, or raw provider errors in the chat message.
- Do not add per-operation or per-surface configuration for this first policy.
- Do not hardwire Telegram into session or compaction code.
- Do not emit chat statuses for direct local TUI, run, setup, or worker sessions.
- Do not add legacy shims or migration paths.

## Shape

The existing `operation_status` message and channel outbox remain the delivery contract. `src/sessions/open.ts` already subscribes to Pi's `compaction_start` and `compaction_end` events for logs; channel-delivered session opening should add a scoped publisher that is absent from direct local sessions.

The shared status text should be transport-neutral. Surface adapters may apply their normal status formatting and message-size rules, but they should not reinterpret compaction state or inspect private session internals.

## Implementation Notes

- Thread the scoped publisher from `SessionPool` or `AgentChannelRuntime` into channel session opening rather than teaching the generic session opener about Telegram.
- Treat `errorMessage` with `willRetry !== true` as terminal. Do not surface ordinary aborts unless implementation evidence shows that an abort is an actionable failure rather than cancellation.
- Keep the durable status record correlated to its channel and target agent; no synthetic agent reply is needed.
- Existing `shrimpy sessions compaction ... --json`, `shrimpy gateway status`, and `shrimpy gateway logs` remain the CLI inspection paths.
- Add tests for terminal failure publication, retry suppression, successful/aborted compaction silence, direct-session silence, and failure isolation.

## Done

- A terminal compaction failure in a Telegram-backed gateway session produces one concise visible status.
- Routine start, success, retryable failure, and ordinary abort events do not add chat noise.
- The channel log contains the typed status and no private compaction contents.
- Direct local sessions remain surface-silent.
- Unit tests cover dispatch policy, existing outbox delivery, and failure isolation.
