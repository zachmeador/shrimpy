# 🦐 TUI-010: TUI Backlog Closeout Plan

Status: draft
Priority: P2
Area: TUI
Depends On: [TUI-004](tui-004-agent-session-navigator.md), [TUI-005](tui-005-model-switch-message-renderer.md), [TUI-006](tui-006-expanded-tool-call-inspection.md), [TUI-007](tui-007-pi-patch-surface-reduction.md), [TUI-008](tui-008-resume-preview-context-stripping.md), [TUI-009](tui-009-bare-shrimpy-agent-resume.md)

## Why

The active TUI backlog items are small enough to understand individually but connected enough to collide in one implementation branch. TUI-005, TUI-006, and TUI-008 are narrow display fixes. TUI-007 changes the private Pi patch layer those fixes pass through. TUI-004 and TUI-009 both depend on all-agent session inventory and target selection. This note is the coordination map for closing TUI-004 through TUI-009 without losing the boundaries captured in each note.

The immediate worktree goal is review of this plan. After maintainer review, the same branch may become the coordinated implementation branch, or the narrow display fixes may be split into child worktrees while this note remains the merge map.

## Current State

- TUI-004 is the broadest product feature: workspace-level `/agent` navigation, all-agent session inventory, live target switching, footer agent identity, and gateway-owned session safety.
- TUI-005 adds a durable renderer for `shrimpy_model_switch` custom messages through Pi's registered custom-message renderer path.
- TUI-006 improves compact-tool expanded rendering, especially full `bash` command inspection.
- TUI-007 reduces and hardens Shrimpy's private Pi TUI patch surface, including command definition unification and install-time contract checks.
- TUI-008 strips Shrimpy turn-context envelopes from `/resume` previews without changing stored transcripts.
- TUI-009 changes bare interactive startup so `shrimpy` can resume the most recent active TUI agent instead of always selecting the first configured agent.

## Connection Map

- TUI-005 and TUI-006 both depend on the `Ctrl+O` expansion state that `installShrimpyToolRendering` propagates while rebuilding chat rows.
- TUI-005 and TUI-008 both use display-only sanitization/rendering. They must not change provider-visible transcript content.
- TUI-007 owns the risk around private Pi member access. Any new TUI private hook added by TUI-008 or TUI-004 should either use an existing sanctioned Pi extension point or be covered by the TUI-007 contract-check helper.
- TUI-004A's workspace-wide session inventory is the natural data source for TUI-009's most-recent active TUI agent resolver. Implement the shared inventory helper before the TUI-009 startup behavior if both land in one branch.
- TUI-004D's `/agent` selector and TUI-007's command-definition unification should converge on one Shrimpy TUI command registry so `/agent`, `/status`, `/settings`, `/model`, `/thinking`, `/changelog`, and `/shrimpy` are not defined in two dialects.
- TUI-004F's footer agent indicator uses Pi's `ctx.ui.setStatus()` and should not add another footer private patch.
- TUI-009's root-startup resolver changes only interactive root startup. The proposed product decision is that `shrimpy "prompt"` without `--agent` keeps targeting the configured default agent unless the maintainer explicitly wants one-shot prompts to follow most-recent TUI state.

## Sequencing

1. Review this plan and confirm the TUI-009 one-shot prompt decision.
2. Land low-risk display fixes as independent commits: TUI-005, TUI-006, then TUI-008. These should be easy to cherry-pick or split if the broader branch needs to pause.
3. Land the TUI-007 patch-surface hardening before adding the broad `/agent` selector, so new command and selector work enters through the cleaned-up seams.
4. Build the shared session inventory slice from TUI-004A and expose CLI coverage from TUI-004B.
5. Use that inventory for TUI-009's bare interactive startup resolver and docs updates.
6. Finish TUI-004's runtime target resolver, footer indicator, `/agent` selector, and gateway-session guardrails.
7. Mark each linked backlog note `review` or close it only after its own `Done` section is satisfied; close this meta note last.

## Collision Risks

- `src/tui/shrimpy-tool-rendering.ts`, `src/tui/shrimpy-command-surface.ts`, `src/tui/shrimpy-context-rendering.ts`, `src/tui/shrimpy-model-selection.ts`, and `src/tui/shrimpy-settings.ts` are shared TUI patch surfaces.
- `src/sessions/open.ts`, `src/sessions/direct.ts`, `src/sessions/service.ts`, and `src/sessions/storage.ts` are shared by TUI-004 and TUI-009.
- `extensions/shrimpy-commands.ts` and `src/sessions/pi-resources.ts` are shared by TUI-004F, TUI-005, and TUI-007.
- TUI tests may need shared fixtures for fake Pi internals; update those fixtures once per branch instead of separately per item.

## Boundaries

- Do not fork Pi's TUI or create a parallel chat/session renderer.
- Do not change model-visible transcript content for display-only fixes.
- Do not attach a TUI directly to a gateway-owned active session without explicit later design and confirmation.
- Do not add compatibility shims or legacy command aliases while replacing TUI behavior.
- Do not bundle unrelated web, chat-surface, setup, or vault work into this branch.

## Done

- The maintainer has reviewed and accepted or amended this sequencing plan.
- The active TUI notes have a single documented implementation order and collision map.
- The branch can proceed as the coordinated closeout branch for TUI-004 through TUI-009, or split narrow items into child branches with this note as the merge map.
- After implementation, TUI-004 through TUI-009 are each marked ready for review or closed according to their own `Done` sections, and this note is updated with the final landing summary.
