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
  - `shrimpy-context-rendering.ts` wraps `addMessageToChat` to strip the turn-context prefix from display.
  - `shrimpy-tool-rendering.ts` wraps `setToolsExpanded` and touches `pendingTools`, `chatContainer.children`, and streaming fields.
  - `shrimpy-model-selection.ts` replaces `showModelsSelector`, wraps `createBaseAutocompleteProvider` and `setupKeyHandlers`, and live-patches the internals of Pi's model selector component instance (`sortModels`, `filterModels`, `updateList`, `handleInput`) for favorites.
  - `shrimpy-settings.ts` reaches selector, editor, ui, and footer privates.
- `src/app/pi-internals.ts` deep-imports Pi `dist/` modules: theme, `ThinkingSelectorComponent`, http dispatcher, provider display names.
- Extension API hooks now available that overlap with patches: `ctx.ui.addAutocompleteProvider()`, `registerMessageRenderer()`, `pi.appendEntry()` plus `registerEntryRenderer()`, `ctx.ui.setStatus()`, `ctx.ui.setWidget()`/`setFooter()`/`setHeader()`, and `registerCommand` with argument completions.
- `/status` and `/shrimpy` are each defined in two places: extension registration owns discovery/completions and a notice handler, while the command-surface submit patch intercepts submission and performs the real rendering through Pi-private chat-container access.
- Patch-time guarding is inconsistent: `shrimpy-model-selection.ts` checks members before patching and degrades gracefully; the command surface patches unconditionally.
- The previous extension-API-gap analysis is stale. Pi added custom-entry renderers in v0.80.4, and Shrimpy's pinned Pi v0.80.6 exposes `pi.appendEntry()` plus `registerEntryRenderer()`. Custom entries are durable session entries, render immediately and during transcript rebuild, and never become agent messages or pass through `convertToLlm`. This is the sanctioned persistent-but-display-only seam for `/status` and `/shrimpy`; the proposed `CustomMessage.excludeFromContext` dependency is unnecessary.
- The remaining command-surface behaviors are not one problem: `/new` archive handling is a session lifecycle hook, `/share` is command suppression, bare `/thinking` opens a selector while the registered `/thinking <level>` command handles explicit values, and `/changelog` replaces a Pi built-in that `InteractiveMode` intercepts before extension commands reach `AgentSession.prompt()`.

## Build

- Migrate slash-command autocomplete filtering (hiding `/scoped-models` and `/share`) from the `createBaseAutocompleteProvider` wrap to `ctx.ui.addAutocompleteProvider()`, then delete the wrap.
- Add an install-time contract check: a small shared helper each installer uses to assert the private members it is about to patch exist with the expected shape. On mismatch, fail at TUI launch with a diagnostic naming the installer and member, so a Pi upgrade surfaces immediately instead of misbehaving silently.
- Move `/status` and `/shrimpy` completely onto Pi's extension API. One in-process Shrimpy command extension factory owns each command's name, description, completions, and handler. The handler builds an immutable output snapshot and appends a small Shrimpy custom entry; one registered entry renderer renders those snapshots in the TUI.
- Store output captured at invocation time, not command arguments that a renderer recomputes later. A restored historical `/status gateway` block must show the status observed when it ran, and rendering must remain a pure operation without filesystem or service inspection.
- Keep the custom-entry payload small and serializable, initially plain text or Markdown. Do not persist ANSI/theme output and do not introduce a general status-document AST solely to reproduce bold labels; apply presentation in the entry renderer.
- Delete the `/status` and `/shrimpy` branches from the patched editor submit handler, their placeholder notice handlers, and the corresponding direct `chatContainer` rendering path after the extension flow is covered.
- Split or rename the remaining `shrimpy-command-surface.ts` responsibilities so each private patch states its real purpose. Evaluate `/new` archive handling, `/share` suppression, the bare `/thinking` selector, and the `/changelog` override independently; do not preserve a general Shrimpy command router after `/status` and `/shrimpy` leave it.

## Decisions

- The model-favorites patch is the deepest reach (duck-typed live patch of a Pi component instance). Either upstream a favorites feature to Pi or keep the patch explicitly marked first-to-delete on breakage. Do not grow it.
- Pi custom entries, not custom messages with a new context-exclusion flag, own durable display-only command output. The upstream [earendil-works/pi#5654](https://github.com/earendil-works/pi/issues/5654) request is no longer a dependency for this item.
- Command output entries are historical snapshots. They do not recompute live workspace state when a session is restored, its transcript is rebuilt, or its theme changes.
- Registering an extension command does not override Pi built-ins handled earlier by `InteractiveMode`; `/changelog` therefore remains a separate patch/upstream decision rather than being folded into the `/status` migration.
- Model-switch rendering now uses Pi's `registerMessageRenderer` path. TUI-004F's footer agent indicator uses `ctx.ui.setStatus()`, already noted in TUI-004.
- A TUI rebuild on pi-tui primitives is out of scope and not currently justified; the tipping point would be a UI shape `InteractiveMode` cannot express (multi-pane, multiple visible sessions), not more tweaks of the current shape.

## Boundaries

- Do not fork `InteractiveMode` or build a parallel chat renderer.
- User-visible TUI behavior stays identical after each migration.
- Replaced patches are deleted, not shimmed.
- Do not add mutable module-global state to pass `AppRuntime` or session metadata into a path-loaded extension. Use an in-process factory with explicit, narrow dependencies.
- Do not add legacy `sendMessage()` or patched-submit fallbacks after the custom-entry route replaces them.

## Implementation Notes

- Likely files: `src/tui/*.ts`, `extensions/shrimpy-commands.ts` or its replacement under `src/sessions/`, `src/sessions/pi-resources.ts`, session resource-loader assembly call sites, and a new shared contract-check helper under `src/tui/`.
- The command factory needs explicit Shrimpy status inputs such as runtime/workspace inspection, active agent, channel, session type, and cwd; the current Pi model is available from `ExtensionCommandContext`. Prefer a narrow status context if passing `AppRuntime` across the session-resource boundary would blur layering.
- Validate the custom-entry spike with `/shrimpy` before moving `/status`: immediate rendering, established-session reload, transcript rebuild, absence from `buildSessionContext().messages`, execution while the agent is streaming, and Pi's lazy persistence behavior in a brand-new command-only session.
- The per-installer internals interfaces already enumerate the patched members; the contract check can be derived from them, and the patched-member count is the metric to track.
- Related: the shrimpy-dev-pi-upgrade skill flow; this item reduces what each Pi upgrade evaluation must re-verify.

## Done

- Autocomplete filtering rides the extension API and the corresponding wrap is deleted.
- Every remaining installer verifies its patched members at install time and fails with a clear diagnostic when Pi internals change.
- `/status` and `/shrimpy` each have one registered definition owning metadata, completions, and behavior; neither is recognized by a patched submit handler.
- Their visible output uses `appendEntry()` plus `registerEntryRenderer()`, survives Pi transcript restoration/rebuild in an established session, and is absent from model context.
- Historical command entries render stored plain-text or Markdown snapshots without recomputing live status and without persisted theme escape codes.
- Remaining command-surface patches are separated and named by the behavior they own; no general duplicate Shrimpy command router remains.
- The patched-private-member count before and after is recorded in this note, and it went down.
- The command-only empty-session persistence behavior is tested and either matches the desired durability or is recorded as an accepted Pi lazy-session limitation; it does not reintroduce a custom-message or private-rendering fallback.
