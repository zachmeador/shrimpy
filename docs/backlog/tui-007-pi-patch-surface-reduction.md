# 🦐 TUI-007: Pi TUI Patch Surface Reduction

Status: draft
Priority: P2
Area: TUI
Depends On: none

## Why

Shrimpy currently customizes Pi through six installers that describe and mutate `InteractiveMode` private fields. Those patches make ordinary Pi upgrades risky, and their unit tests mostly verify Shrimpy's hand-written facsimile of Pi internals rather than the real contract.

Pi 0.80.6 already exposes more sanctioned UI and lifecycle APIs than this backlog previously accounted for. The work should begin by deleting patches that now have a public replacement, then make explicit product choices for the few behaviors that do not.

## Current State

- `shrimpy-command-surface.ts` wraps editor submission and clear handling for Shrimpy commands, archive-on-`/new`, `/share` suppression, the thinking selector, and the changelog override.
- `shrimpy-activity-indicator.ts` replaces footer behavior and reads Pi's private loading, compaction, and retry loaders.
- `shrimpy-context-rendering.ts` wraps message insertion and globally patches Pi session-listing methods to strip Shrimpy turn context from previews.
- `shrimpy-tool-rendering.ts` wraps tool expansion, traverses chat children, and rebuilds the transcript. Part of that rebuild exists only because Shrimpy currently couples context-envelope visibility to Pi's tool-output expansion state.
- `shrimpy-model-selection.ts` replaces Pi's model selector, autocomplete creation, key handling, and live selector-component internals to support favorites.
- `shrimpy-settings.ts` copies a large portion of Pi's settings interaction while reaching private selector, editor, UI, and footer state.
- `src/app/pi-internals.ts` deep-imports Pi modules even where Pi now publicly exports `ThinkingSelectorComponent`, `initTheme`, and `Theme`.
- Pi 0.80.6 provides `ctx.ui.select()`, `ctx.ui.custom()`, `ctx.ui.setStatus()`, `ctx.ui.setWorkingIndicator()`, widgets/header/footer/title hooks, autocomplete wrapping, public tool-expansion controls, custom entry renderers, and session lifecycle events.

## Build

Work in deletion-first slices and record the private member/override count after each slice.

1. Replace deep imports that now have public Pi exports. Leave only genuinely unexported utilities behind and name why each remains.
2. Move the working-state presentation to `ctx.ui.setWorkingIndicator()`. Accept the sanctioned indicator lifecycle instead of preserving private footer-loader choreography pixel for pixel.
3. Make bare `/thinking` an extension command using `ctx.ui.select()` or `ctx.ui.custom()` and Pi's public thinking component/export, then remove its private selector/footer path.
4. Move archive-on-`/new` to a session lifecycle path if `session_start` reason and `previousSessionFile` provide the required post-success semantics. If they do not, isolate the behavior as one narrow upstream request instead of retaining a general clear-command wrapper.
5. Delete the tool-rendering patch where Pi's public `getToolsExpanded()`/`setToolsExpanded()` is sufficient. Decouple turn-context visibility from tool-output expansion; context envelopes and tool bodies are unrelated controls.
6. Stop cloning Pi's `/settings` UI. Let Pi own provider/model settings and expose Shrimpy-only values through a separate extension command such as `/shrimpy settings`.
7. Resolve command restrictions explicitly. Autocomplete filtering can hide `/share` and `/scoped-models`, but it does not disable them; either obtain a sanctioned upstream command-disable hook or make those commands intentionally available. Do not describe suggestion filtering as enforcement.
8. Let Pi own `/changelog` and move Shrimpy release notes under `/shrimpy changelog`, unless an upstream override hook is accepted.
9. Upstream model favorites or delete the customization when it breaks. Do not grow the live component monkey-patch.

## Status And Help Output

`/status` and `/shrimpy` should each have one extension-owned definition for metadata, completion, and execution. Their output is operational and should remain ephemeral by default.

- Do not persist `/status` snapshots as custom session entries merely because custom entry renderers exist. Restored transcripts would show stale operational state, and persistence would change current behavior.
- First try a sanctioned custom overlay/widget presentation. If command output must remain inline in chat, ask Pi for a small append-ephemeral-display-block API rather than routing it through model context or private chat-container mutation.
- A durable custom entry is acceptable only after an explicit product decision that historical status/help blocks are desirable. It is not the default migration plan.

## Failure Policy

- Validate a private seam before patching it and emit a diagnostic that names the disabled Shrimpy feature when the seam changed.
- Cosmetic or optional patch failure must degrade that feature rather than prevent the entire TUI from launching.
- A launch-blocking check is reserved for a seam whose failure could corrupt session state or violate an enforced safety boundary.
- Test public replacement paths against the real pinned Pi package where practical; fake `InteractiveMode` shapes remain useful only for the private seams that survive.

## Boundaries

- Do not fork `InteractiveMode` or build a parallel chat renderer.
- Prefer deleting customization over preserving every visual detail.
- Replaced patches are deleted, not shimmed.
- Do not use tool expansion as a proxy for Shrimpy context visibility.
- Do not add mutable module-global state to feed extension factories.
- Do not call autocomplete hiding a security or policy control.
- User-visible changes are allowed when they remove a private patch and retain the underlying capability clearly.

## Open Decisions

- Whether inline ephemeral command output needs a new Pi API or can become an overlay/widget.
- Whether `/share` and `/scoped-models` must be truly disabled or merely absent from suggestions.
- Whether model favorites justify an upstream Pi feature; the current private patch is not a durable Shrimpy-owned surface.

TUI-007 stays `draft` until those product decisions are made. Individual deletion slices that do not depend on them can still be promoted and implemented separately.

## Done

- Every surviving private patch names the missing public Pi capability and its failure/degradation behavior.
- Public Pi exports replace avoidable `dist/` imports.
- Working-state presentation, thinking selection, and tool expansion no longer read or mutate private Pi state.
- Context-envelope visibility is independent of tool-output expansion.
- Shrimpy no longer clones Pi's full settings interaction.
- `/status` and `/shrimpy` each have one extension-owned command definition and do not enter model context; persistence is deliberate rather than accidental.
- Command hiding and command disabling are accurately distinguished and tested.
- `/changelog`, `/new`, and model favorites each have one narrow owner instead of sharing a general submit-handler patch.
- Optional visual customization breakage does not brick TUI launch.
- The private patch/member count is recorded and materially smaller.
