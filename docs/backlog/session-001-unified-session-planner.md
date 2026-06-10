# 🦐 SESSION-001: Unified Session Planner And Turn-As-Value Dispatch

Status: todo
Priority: P2
Area: Sessions
Depends On: none

## Why
Two problems in session assembly, one structural and one sharp.

Structural: session opening exists twice. `prepareDirectSessionOpen` in `src/sessions/direct.ts` (tui/run) and the `AgentChannelRuntime` constructor plus `planForChannel` closure in `src/agents/channel-runtime.ts` (gateway) each assemble model resolution, inference, thinking, tool policy, tools, descriptor, and turn-context prep. Their semantic differences are emergent properties of parallel code, not declared decisions: direct sessions restore the saved session model, gateway sessions resolve once per agent at gateway construction and share that model across all channels until restart. Keeping the paths consistent is manual work that will drift.

Sharp: the turn-context handoff in `src/sessions/registry.ts` reunites two halves of one turn by string equality. The registry computes turn context for a message, stashes `{prompt, text}` on the managed session, and the open-plan's `prepareTurnContext(prompt)` hook returns the stash if the prompt string matches. Two identical queued prompts, or any change in when Pi invokes the hook, breaks it silently.

## Build
- One `SessionPlanner` per agent with `planDirect(label, overrides)` and `planChannel(channel)`. The direct/gateway differences (model restore behavior, egress wiring, publication channel, model-resolution timing) become explicit, named policy in one module.
- Make a turn a value: dispatch builds `{ message, promptBody, turnContext }` and hands it to the session run as one unit. Delete the `pendingTurnContext` stash and prompt-string matching.
- If Pi's session API cannot accept per-turn context alongside the prompt, extend Pi at that specific pressure point rather than keeping the side channel.
- State the model-resolution timing decision in the planner ("gateway resolves per agent at startup; direct restores saved session model") so it is readable and testable instead of archaeological.

## Boundaries
- No behavior changes to what agents see in their prompts; this is assembly-shape work, and the persisted session JSONL must remain an exact representation of the model-facing turn.
- Do not merge direct and gateway semantics just because the code merges — divergence is fine when declared.
- Do not rebuild Pi session runtime concepts; the planner produces `SessionOpenPlan`s, Pi still owns the session.

## Implementation Notes
- Collapse the duplicated resolution in `src/sessions/direct.ts` and `src/agents/channel-runtime.ts`; both become thin callers of the planner.
- `SessionRegistry.dispatch`/`runTurn` in `src/sessions/registry.ts` carries the turn value; `planWithPendingTurnContext` is deleted.
- Check `runSessionTurn` in `src/sessions/turn-output.ts` for where per-turn context can be passed explicitly; the Pi turn-context controller in `src/sessions/turn-context.ts` is the seam to change or remove.
- Tests: two identical queued messages each get their own turn context; direct session model restore and gateway per-startup resolution both covered as planner policy tests.

## Done
- One assembly path; `direct.ts` and `channel-runtime.ts` no longer duplicate model/tool/context resolution.
- `pendingTurnContext` and prompt-string matching are gone.
- Queued identical prompts receive their correct per-message turn contexts.
- The direct-vs-gateway policy differences are stated in one module and covered by tests.
