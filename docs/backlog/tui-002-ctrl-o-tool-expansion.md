# 🦐 TUI-002: Ctrl+O Tool Expansion Regression

Status: done
Priority: P1
Area: TUI

## Why
The TUI's `Ctrl+O` tool-row toggle no longer reliably expands compact tool calls to show their arguments and result contents. In some sessions it appears to do nothing; in others it only works for some tool rows. This breaks the main inspection path for collapsed tool activity, especially when a user needs to review a command, file path, channel read, child-agent prompt, or tool output after the row has already rendered.

Shrimpy deliberately renders tool calls compactly, but the collapsed row must remain inspectable on demand. `Ctrl+O` and `/toolrows` should be equivalent ways to switch between one-line summaries and expanded call/result detail for all supported tool rows.

## Repro
- Start a Shrimpy TUI session.
- Let the agent run one or more tools that render as compact rows with the `(ctrl+o)` hint.
- Press `Ctrl+O`.
- Expected: existing compact rows re-render expanded and show the full call/result contents where available.
- Actual: rows sometimes stay collapsed, show only partial detail, or expand inconsistently across tool types.

## Build
- Identify whether Pi's `Ctrl+O` keybinding still updates the same expanded state exposed through `ctx.ui.getToolsExpanded()` and `ctx.ui.setToolsExpanded()`.
- Verify that `/toolrows` and `Ctrl+O` both invalidate/re-render existing tool message rows, not only future tool events.
- Make Shrimpy daemon tools expand both call arguments and result contents consistently.
- Make compact overrides for Pi built-in tools expand consistently with Shrimpy daemon tools.
- Cover in-progress, completed, failed, and restored-session tool rows if Pi exposes separate render paths for those states.
- Keep the compact default unchanged; this is a fix to the expansion path, not a redesign of tool rendering.

## Outcome
- `installShrimpyContextRendering` now follows Pi's tool-output expansion state and rebuilds existing rows when the state changes.
- Live pending tool rows survive expansion rebuilds instead of being replaced by stale placeholders.
- Compact built-in tool renderers show result output when expanded, including read/write detail.
- Regression tests cover expansion state changes, live pending rows, and compact built-in expanded output.

## Boundaries
- Do not fork Pi's full TUI for this fix.
- Do not remove compact tool rows or the `(ctrl+o)` hint.
- Do not add a second Shrimpy-owned keybinding system unless Pi no longer exposes the needed hook.
- Do not add compatibility aliases or legacy command shims.

## Implementation Notes
- Likely Shrimpy files: `extensions/compact-tools.ts`, `src/tools/daemon.ts`, `src/sessions/pi-resources.ts`, and `src/sessions/direct.ts`.
- Compare upstream Pi source for current `InteractiveMode` keybinding and tool-render invalidation behavior before deciding whether this is a Shrimpy renderer bug or a Pi integration regression. The latest checked upstream version was `0.77.0`.
- Shrimpy daemon tools currently return an empty result container when `options.expanded` is false and plain text when expanded.
- The bundled `compact-tools` extension overrides Pi built-in tool renderers and also depends on `context.expanded` / `options.expanded`.
- Check whether `renderCall` needs an expanded branch for full arguments instead of only hiding the `(ctrl+o)` suffix.
- Pi `0.75.5` changed collapsed `read` tool cards to show only the read line until `Ctrl+O` expands them. If Shrimpy's compact renderer wraps or replaces Pi's read renderer, verify it still preserves that intended expanded/collapsed split.
- Pi `0.77.0` keeps `ToolRenderContext` in `core/extensions/types.ts`, but it is not exported from the package root. The latest Shrimpy migration test passed only after `extensions/compact-tools.ts` stopped importing `ToolRenderContext` from `@earendil-works/pi-coding-agent` and used a small local structural type for the fields Shrimpy reads.
- Current `ToolRenderContext` fields include `args`, `toolCallId`, `invalidate`, `lastComponent`, `state`, `cwd`, `executionStarted`, `argsComplete`, `isPartial`, `expanded`, `showImages`, and `isError`. Shrimpy should avoid depending on the whole internal shape unless Pi exports it explicitly.
- Normal `npm test` does not compile `extensions/*.ts`. Add an explicit extension typecheck to the verification path for this bug and for the Pi package-scope migration.
- Add a focused regression test where possible; otherwise document a manual TUI verification matrix covering `Ctrl+O`, `/toolrows`, Shrimpy tools, and compact built-in tools.

## Done
- Pressing `Ctrl+O` expands and collapses existing compact tool rows reliably in the Shrimpy TUI.
- `/toolrows` produces the same visible state change as `Ctrl+O`.
- Expanded rows show useful call contents and tool results for Shrimpy daemon tools and compact built-in tools.
- Manual or automated regression coverage records the previously intermittent behavior.
