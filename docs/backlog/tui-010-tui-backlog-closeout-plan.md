# 🦐 TUI-010: TUI Backlog Closeout Plan

Status: draft
Priority: P2
Area: TUI
Depends On: [TUI-004](tui-004-agent-session-navigator.md), [TUI-007](tui-007-pi-patch-surface-reduction.md), [TUI-009](tui-009-bare-shrimpy-agent-resume.md)

## Why

The active TUI backlog items are small enough to understand individually but connected enough to expose larger architectural decisions. TUI-005, TUI-006, and TUI-008 are narrow display fixes. TUI-007 changes the private Pi patch layer those fixes pass through. TUI-004 and TUI-009 both depend on all-agent session inventory and target selection. Together they force decisions about display-only messages, command ownership, session inventory, runtime target switching, and how much Shrimpy should keep patching Pi internals.

This worktree exists to make those architectural pieces explicit before implementation. The immediate goal is review of this plan. After maintainer review, the same branch becomes the coordinated implementation branch for the full closeout unless a phase is deliberately split into a child branch with this note as the merge map.

## Closed Slices

- TUI-005 native model-switch custom message rendering is implemented and reviewed.
- TUI-006 expanded compact-tool call inspection is implemented and reviewed.
- TUI-008 resume-preview turn-context stripping is implemented and reviewed.

## Current State

- TUI-004 is the broadest product feature: workspace-level `/agent` navigation, all-agent session inventory, live target switching, footer agent identity, and gateway-owned session safety.
- TUI-007 reduces and hardens Shrimpy's private Pi TUI patch surface, including command definition unification and install-time contract checks.
- TUI-009 changes bare interactive startup so `shrimpy` can resume the most recent active TUI agent instead of always selecting the first configured agent.

## Architectural Smells

- Display messages currently mix different visibility contracts. Some custom messages are part of the model-visible transcript, such as `shrimpy_model_switch`; command output and local status blocks want to be visible in the TUI without entering provider context.
- Shrimpy command behavior is split between Pi extension registration and private submit-handler patches. That creates duplicate command definitions and makes command output policy harder to reason about.
- TUI customization relies on private Pi internals without one shared install-time contract check, so Pi upgrades can fail at runtime after tests pass against Shrimpy fakes.
- Session selection exists per agent, while the desired TUI behavior is workspace-level. TUI-004 and TUI-009 should share an inventory/resolution service instead of adding two ways to scan session storage.
- Cross-agent session switching needs transactional semantics. A failed target open must leave the current TUI session intact; preflight is necessary but not enough if Pi tears down the current session before replacement.
- Startup agent choice and in-TUI agent switching are the same product concept at different times: "which agent/session is this TUI attached to?" They should not drift into separate policies.

## Architectural Decisions

- Custom messages need explicit visibility intent at creation and rendering time: model-visible, display-only, or status/control. TUI-005 keeps `shrimpy_model_switch` model-visible. TUI command output should wait for a Pi-supported display-only path before migrating away from the private command-surface patch.
- Track Pi's `excludeFromContext` work through [earendil-works/pi#5654](https://github.com/earendil-works/pi/issues/5654) and the linked implementation PR. Do not assume the final upstream API shape until the branch used by Shrimpy is confirmed.
- Define one Shrimpy TUI command registry that separates discovery/completion, execution, rendering, and transcript visibility policy. Avoid a single generic command abstraction that hides those differences.
- Define one workspace session inventory service before implementing either `/agent` navigation or bare-startup most-recent-agent selection.
- Define a TUI session target abstraction that can prepare a target agent/session, validate it, and only then hand it to Pi's switch path. If Pi cannot provide atomic replacement, keep the Shrimpy workflow to same-agent opens until the failure semantics are safe.
- Prefer Pi extension APIs for status/footer/custom rendering. Any remaining private hook must be covered by a shared contract checker from TUI-007.

## Connection Map

- TUI-007 owns the risk around private Pi member access. Any new private hook added by remaining TUI work should either use an existing sanctioned Pi extension point or be covered by the TUI-007 contract-check helper.
- TUI-004A's workspace-wide session inventory is the natural data source for TUI-009's most-recent active TUI agent resolver. Implement the shared inventory helper before the TUI-009 startup behavior if both land in one branch.
- TUI-004D's `/agent` selector and TUI-007's command-definition unification should converge on one Shrimpy TUI command registry so `/agent`, `/status`, `/settings`, `/model`, `/thinking`, `/changelog`, and `/shrimpy` are not defined in two dialects.
- TUI-004F's footer agent indicator uses Pi's `ctx.ui.setStatus()` and should not add another footer private patch.
- TUI-009's root-startup resolver changes only interactive root startup. The proposed product decision is that `shrimpy "prompt"` without `--agent` keeps targeting the configured default agent unless the maintainer explicitly wants one-shot prompts to follow most-recent TUI state.

## Sequencing

1. Architecture review gate: confirm the visibility policy, command registry shape, session inventory owner, TUI switch failure semantics, and the TUI-009 one-shot prompt decision.
2. Patch-boundary gate: land the TUI-007 contract checker and command-definition cleanup that can ship without upstream Pi changes. Leave display-only command migration gated on the final Pi `excludeFromContext` or equivalent API.
3. Inventory gate: build the shared session inventory slice from TUI-004A and expose CLI coverage from TUI-004B.
4. Use that inventory for TUI-009's bare interactive startup resolver and docs updates.
5. Switch-safety gate: prove target preparation and failure recovery before enabling cross-agent session replacement in the TUI.
6. Finish TUI-004's runtime target resolver, footer indicator, `/agent` selector, and gateway-session guardrails.
7. Mark each linked backlog note `review` or close it only after its own `Done` section is satisfied; close this meta note last.

## Collision Risks

- `src/tui/shrimpy-tool-rendering.ts`, `src/tui/shrimpy-command-surface.ts`, `src/tui/shrimpy-context-rendering.ts`, `src/tui/shrimpy-model-selection.ts`, and `src/tui/shrimpy-settings.ts` are shared TUI patch surfaces.
- `src/sessions/open.ts`, `src/sessions/foreground.ts`, `src/sessions/resolver.ts`, `src/sessions/service.ts`, and `src/sessions/storage.ts` are shared by TUI-004 and TUI-009.
- `extensions/shrimpy-commands.ts` and `src/sessions/pi-resources.ts` are shared by TUI-004F, model-switch rendering, and TUI-007.
- TUI tests may need shared fixtures for fake Pi internals; update those fixtures once per branch instead of separately per item.
- Upstream Pi changes can invalidate the TUI-007 migration shape. Re-check the linked Pi issue/PR before implementing display-only command output through extensions.

## Boundaries

- Do not fork Pi's TUI or create a parallel chat/session renderer.
- Do not change model-visible transcript content for display-only fixes.
- Do not attach a TUI directly to a gateway-owned active session without explicit later design and confirmation.
- Do not add compatibility shims or legacy command aliases while replacing TUI behavior.
- Do not treat upstream Pi display-only message support as landed until Shrimpy has pinned or upgraded to a Pi version that carries the confirmed API.
- Do not bundle unrelated web, chat-surface, setup, or vault work into this branch.

## Done

- The maintainer has reviewed and accepted or amended this sequencing plan.
- The architectural decisions for visibility, command ownership, inventory, and switch failure semantics are captured before code changes.
- The active TUI notes have a single documented implementation order and collision map.
- The branch can proceed as the coordinated closeout branch for TUI-004, TUI-007, and TUI-009, or split narrow items into child branches with this note as the merge map.
- After implementation, the remaining linked TUI notes are each marked ready for review or closed according to their own `Done` sections, and this note is updated with the final landing summary.
