# 🦐 TUI-007: Pi TUI Patch Surface Reduction

Status: review
Priority: P2
Area: TUI
Depends On: none

## Why

Shrimpy customized Pi through six broad installers that described and mutated `InteractiveMode` private fields. Those patches made ordinary Pi upgrades risky, but deleting them wholesale also deleted established Shrimpy UX. The useful target is the smallest honest compatibility surface: use public Pi APIs where they preserve behavior, and retain narrow named seams where pinned Pi has no public equivalent.

## UX Implications

- `/settings` opens the Shrimpy/Pi namespace chooser. The Shrimpy branch shows workspace, session, model, thinking, tool-policy, channel-policy, compaction, and Shrimpy-default information; current auto-compaction and quiet-startup changes update the live session as well as persisted defaults. The Pi branch is Pi's real settings UI and callbacks.
- Bare `/thinking` opens Pi's rich selector, preselects the current level, includes Pi's descriptions, and shows only levels supported by the current model. Explicit inputs use canonical Pi levels. The removed `on` alias does not return and Shrimpy does not assign a made-up meaning such as `medium`.
- `/model` retains Shrimpy favorites: Space toggles a favorite, favorites sort first, and the list persists in `tui.modelFavorites`. Ctrl+P cycling remains guarded so accidental cycling cannot bypass that selection flow.
- `/share` and `/scoped-models` remain hidden from autocomplete and guarded in the interactive UI. Suggestion filtering is convenience, not the only enforcement path.
- `/status`, bare `/shrimpy`, and `/changelog` stay inline and ephemeral in the transcript display. They do not become model context. `/changelog` shows Shrimpy release notes rather than Pi's package changelog.
- Ctrl+O remains the shared transcript-inspection toggle: collapsed turns consume no rows for generated turn context, while expanded turns show that context alongside Pi-expanded tool output.
- Both shrimp signals remain. Pi's public working indicator animates while the model works; the small bottom-right footer shrimp parks while idle and animates during streaming, automatic retry, and compaction.
- A successful `/new` starts a fresh conversation for the selected agent and archives the previous transcript. It does not exit the TUI or switch to an invented namespace.

## Implementation

- `extensions/activity-indicator.ts` configures the working indicator through `ctx.ui.setWorkingIndicator()`.
- `src/tui/shrimpy-footer.ts` composes Pi's exported `FooterComponent` through `ctx.ui.setFooter()`. Public `AgentSession` events cover streaming, retry, compaction, and session replacement without reading Pi loader fields.
- `extensions/thinking.ts` is a thin command adapter over Pi's public thinking getter/setter and `ThinkingSelectorComponent`. Pi still owns thinking state and model-specific clamping.
- `extensions/archive-new-session.ts` archives the previous transcript from the public post-success `session_start` event when `reason` is `new` and `previousSessionFile` is present.
- Direct-session turn context persists as a model-visible `shrimpy_turn_context` custom message after the unchanged user message. Pi's renderer expansion state drives visibility. One component-render seam suppresses Pi's unconditional leading spacer while that specific message is collapsed.
- Pi owns tool expansion. The old transcript traversal and tool-component rebuilding patch is deleted.
- `/status` and `/shrimpy` retain public extension registrations for command metadata and non-TUI fallback panels. A narrow submission seam preserves inline ephemeral output for the TUI and redirects Pi's built-in changelog handler to Shrimpy notes.
- `/settings` retains a namespace installer because Pi handles the built-in command before extension hooks and exposes no settings registry. It invokes Pi's original selector unchanged for the Pi branch and uses a Shrimpy panel for Shrimpy state.
- `/model` uses Pi's real selector, with a compatibility decorator for favorite ordering/toggling. The same installer hides guarded autocomplete entries and disables model-cycle actions.
- `initTheme` and all Pi UI components now come from public exports. `src/app/pi-internals.ts` retains only unexported provider-display data and pre-construction theme registry/automatic-resolution helpers.

## Compatibility Seams

Four named installers remain:

1. `installShrimpyInlineCommands` wraps editor submission and the built-in changelog handler for inline Shrimpy output and guarded commands.
2. `installShrimpyModelSelectionGuard` decorates Pi's model selector, autocomplete provider, scoped-selector entry, and cycle key actions.
3. `installShrimpySettingsSelector` wraps only the settings entry and generic selector methods to preserve the namespace landing page while delegating the Pi branch back to Pi.
4. `installShrimpyTurnContextRendering` suppresses the otherwise blank collapsed custom-message row for `shrimpy_turn_context` only.

Before this work there were six broad `InteractiveMode` installers. The activity and tool-rendering installers are gone, and `/new` no longer depends on editor internals. The remaining surface is smaller in responsibility, but it is not zero and should not be described as public API.

## Tradeoffs

- Inline ephemeral transcript output, model favorites, an extensible built-in settings surface, and zero-height collapsed custom messages are not available through pinned Pi's public API. Preserving those UX contracts requires compatibility code until Pi exposes suitable hooks.
- The model-selector seam remains the largest and most upgrade-sensitive. Its tests exercise persisted favorite order, Space toggling, command filtering, and cycle guards against the pinned package shape.
- If an optional seam disappears after a Pi upgrade, it should fail locally with a named degraded feature rather than trigger a parallel TUI implementation. Session-state behavior such as `/new` archival stays on public lifecycle events.
- There is no compatibility migration for old turn-context display flags. Current session entries use the model-visible custom-message representation directly.

## Verification

- Public extension coverage exercises the working indicator, footer registration, supported thinking selector, post-`/new` archival, and command registration.
- TUI parity coverage exercises inline status/help/changelog output, share suppression, model autocomplete/cycle guards, persisted favorites, the settings namespace and live auto-compaction update, retry/compaction footer animation, and zero-row collapsed context with Ctrl+O expansion.
- The real pinned Pi session path verifies that the unchanged user message and context custom message are both persisted and delivered to the model.
- Source audits keep the four compatibility installers explicit and verify that the deleted activity, command-surface, context-rebuild, and tool-rendering files stay gone.

## Done

- Public Pi APIs own lifecycle, thinking state, working-indicator state, footer composition, session events, custom-message registration, and tool expansion where they can preserve Shrimpy behavior.
- Established TUI behavior is retained instead of being silently redefined as Pi ownership.
- The backlog, reference docs, changelog, help text, and parity tests describe the same command ownership and UX.
- TUI-007 is ready for final review with four documented compatibility seams and no cloned `InteractiveMode` implementation.
