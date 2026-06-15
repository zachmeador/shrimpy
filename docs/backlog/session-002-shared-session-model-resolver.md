# 🦐 SESSION-002: Shared Session Model Resolver

Status: review
Priority: P2
Area: Sessions
Depends On: none

## Why
`shrimpy models resolve` — the diagnostic whose job is "which model would this session actually use" — re-implements the production resolution algorithm instead of calling it. The rule "restore the saved session model only when no provider/model/policy override is given" lives in three places that must stay in lockstep:

- `src/sessions/planner.ts` computes `restoreModelFromSession` from the override triple; `resolveSessionModelPlan` in `src/sessions/open.ts` applies it by reading the saved model and checking registry auth.
- `src/commands/models.ts` re-derives the same override condition inline, hardcodes `restoreSavedModel` per session kind in `resolveSessionRef`, re-reads the saved model via its own `readRecordedSessionModel`, and re-checks usability via its own `findUsableModel`.

The copies agree today but are already diverging in dialect: the command checks usability through the config-layer `hasConfiguredAuth(registry, model)` behind a cast while production calls `modelRegistry.hasConfiguredAuth(model)`, the command adds a `findActiveSessionFile` pre-check production does not have, and it builds its `SessionManager` with `process.cwd()` where production uses the plan cwd. A diagnostic that runs different code than the session opener reports a parallel universe exactly when model selection misbehaves.

## Build
- Extract one resolver in `src/sessions/models.ts` — roughly `resolveSessionModel({ bootstrap, agent, overrides, readSavedModel })` — owning restore eligibility, the saved-model read, the usability check, and policy fallback, returning the existing `ModelResolution`.
- Keep the session-state read behind a narrow port: a `readSavedModel(): ModelRef | undefined` thunk constructed from a `SessionDescriptor`, so the resolver stays pure and testable.
- `SessionPlanner.planDirect` and `resolveSessionModelPlan` in open.ts become thin callers; the open.ts restore branch collapses into applying the resolver result.
- `cmdModelsResolve` builds the same inputs and renders the returned `ModelResolution`; delete `readRecordedSessionModel`, `findUsableModel`, the inline saved-session precedence block, and the `restoreSavedModel` flags in `resolveSessionRef`.

## Boundaries
- No compatibility shims or deprecated helpers; the command-local copies are deleted outright.
- Do not grow this into an "explain" framework. `ModelResolution` already carries source, per-candidate usability, and problems; the CLI just renders it.
- `models resolve` flags stay as-is. JSON output may gain fields, but existing fields keep their meaning.
- TUI model selection, favorites, and the policy-mutation subcommands (`policies set/add/remove/move-candidate`) are out of scope.

## Shape
"Resolve a session's model" becomes one pure decision with one home in `src/sessions/models.ts`; session open and CLI inspection are both callers, so the diagnostic is trustworthy by construction. The resolver gains a session-state port it did not have, which slightly thickens `sessions/models.ts` — accepted, because the dependency already exists twice in two dialects.

## Implementation Notes
- Touch points: `src/sessions/models.ts`, `src/sessions/planner.ts`, `src/sessions/open.ts`, `src/commands/models.ts`.
- Gateway sessions keep their startup-time resolution in the planner and call the resolver without a saved-model port; gateway never restores, which today is encoded structurally in the planner and as a hardcoded boolean in the command.
- Standardize the saved-model read on descriptor-derived paths and cwd, replacing the command's `process.cwd()` construction.
- Tests: parity between `models resolve --json` and the plan `openSession` would apply, for both gateway and local descriptors; the override triple suppresses restore; an unusable saved model falls back to policy with a problem recorded.

## Done
- Restore eligibility is computed by exactly one function; no inline re-derivations of the override triple remain in `src/commands/models.ts` or `src/sessions/open.ts`.
- `src/commands/models.ts` no longer imports `createSessionManager`, `findActiveSessionFile`, or config-layer `hasConfiguredAuth`; `readRecordedSessionModel`, `findUsableModel`, and the precedence block are gone (~80 lines deleted from the command).
- Outside `src/config/`, usability is checked only via `modelRegistry.hasConfiguredAuth(...)`.
- A parity test asserts `models resolve` and session open pick the same effective model and problems for identical inputs.
