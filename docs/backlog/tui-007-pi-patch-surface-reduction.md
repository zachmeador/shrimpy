# 🦐 TUI-007: Pi TUI Patch Surface Reduction

Status: todo
Priority: P2
Area: TUI
Depends On: none

## Why

Shrimpy customizes Pi at three levels: the public session SDK in `src/sessions/`, Pi's extension API (`extensions/` plus the in-process factories in `src/sessions/pi-resources.ts`), and six installers in `src/tui/` that cast `InteractiveMode` to hand-written interfaces describing Pi's private fields and wrap methods decorator-style. The TUI tests fake those internals, so they verify Shrimpy's wrapper logic, not the Pi contract: a Pi upgrade that renames a private member passes tests and breaks at runtime. Pi's extension API has grown hooks that cover some of these patches. The unsanctioned surface should shrink to the patches that have no sanctioned equivalent, and the remainder should fail loud on Pi upgrades.

## Current State

- Installers and their private touchpoints:
  - `shrimpy-command-surface.ts` wraps the editor submit handler for `/status`, `/thinking`, `/shrimpy`, `/share`, wraps `handleClearCommand` for archive-on-`/new`, and reaches `chatContainer`, `showSelector`, and the footer.
  - `shrimpy-activity-indicator.ts` wraps `footer.render`/`footer.dispose` and reads the private `loadingAnimation`, `autoCompactionLoader`, and `retryLoader` fields.
  - `shrimpy-context-rendering.ts` wraps `addMessageToChat` to strip turn-context blocks from display.
  - `shrimpy-tool-rendering.ts` wraps `setToolsExpanded` and touches `pendingTools`, `chatContainer.children`, and streaming fields.
  - `shrimpy-model-selection.ts` replaces `showModelsSelector`, wraps `createBaseAutocompleteProvider` and `setupKeyHandlers`, and live-patches the internals of Pi's model selector component instance (`sortModels`, `filterModels`, `updateList`, `handleInput`) for favorites.
  - `shrimpy-settings.ts` reaches selector, editor, ui, and footer privates.
- `src/app/pi-internals.ts` deep-imports Pi `dist/` modules: theme, `ThinkingSelectorComponent`, http dispatcher, provider display names.
- Extension API hooks now available that overlap with patches: `ctx.ui.addAutocompleteProvider()`, `registerMessageRenderer()`, `ctx.ui.setStatus()`, `ctx.ui.setWidget()`/`setFooter()`/`setHeader()`, and `registerCommand` with argument completions.
- `/status` is defined in two places: `extensions/shrimpy-commands.ts` registers it for discovery/completions with a notice handler, and the command-surface submit patch implements the real rendering.
- Patch-time guarding is inconsistent: `shrimpy-model-selection.ts` checks members before patching and degrades gracefully; the command surface patches unconditionally.
- The genuine extension-API gap that keeps the command surface alive: extensions cannot append persistent rich blocks to the chat history (`ctx.ui.notify` is transient, widgets are ephemeral).

## Build

- Migrate slash-command autocomplete filtering (hiding `/scoped-models` and `/share`) from the `createBaseAutocompleteProvider` wrap to `ctx.ui.addAutocompleteProvider()`, then delete the wrap.
- Add an install-time contract check: a small shared helper each installer uses to assert the private members it is about to patch exist with the expected shape. On mismatch, fail at TUI launch with a diagnostic naming the installer and member, so a Pi upgrade surfaces immediately instead of misbehaving silently.
- Unify command definitions so one place defines each Shrimpy TUI command. Keep `registerCommand` for discovery and completions; route the implementation from a single definition instead of duplicating `/status` across the extension and the submit patch.
- Write down the upstream ask to Pi: a sanctioned way for extensions to append persistent rich blocks to chat history. When that hook exists, `/status`, `/shrimpy`, and `/changelog` rendering can become plain extensions.

## Decisions

- The model-favorites patch is the deepest reach (duck-typed live patch of a Pi component instance). Either upstream a favorites feature to Pi or keep the patch explicitly marked first-to-delete on breakage. Do not grow it.
- TUI-005 model-switch rendering uses Pi's `registerMessageRenderer` path, already noted in that item. TUI-004F's footer agent indicator uses `ctx.ui.setStatus()`, already noted in TUI-004.
- A TUI rebuild on pi-tui primitives is out of scope and not currently justified; the tipping point would be a UI shape `InteractiveMode` cannot express (multi-pane, multiple visible sessions), not more tweaks of the current shape.

## Boundaries

- Do not fork `InteractiveMode` or build a parallel chat renderer.
- User-visible TUI behavior stays identical after each migration.
- Replaced patches are deleted, not shimmed.

## Implementation Notes

- Likely files: `src/tui/*.ts`, `extensions/shrimpy-commands.ts`, `src/sessions/pi-resources.ts`, and a new shared contract-check helper under `src/tui/`.
- The per-installer internals interfaces already enumerate the patched members; the contract check can be derived from them, and the patched-member count is the metric to track.
- Related: the shrimpy-dev-pi-upgrade skill flow; this item reduces what each Pi upgrade evaluation must re-verify.

## Done

- Autocomplete filtering rides the extension API and the corresponding wrap is deleted.
- Every remaining installer verifies its patched members at install time and fails with a clear diagnostic when Pi internals change.
- Each Shrimpy TUI command has exactly one implementation site.
- The patched-private-member count before and after is recorded in this note, and it went down.
- The Pi upstream ask (persistent chat blocks from extensions) is recorded where the next Pi upgrade evaluation will see it.
