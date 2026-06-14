# 🦐 TUI-006: Expanded Tool Call Inspection

Status: review
Priority: P2
Area: TUI
Depends On: none

## Why

`Ctrl+O` promises an expanded tool view in the TUI, but compact built-in tool rows still truncate the tool call summary itself. This is most painful for `bash`: long shell commands are exactly the commands a user needs to inspect before trusting what ran, and the current expanded view can show output while leaving the command line clipped.

Expanded mode should make the important inputs inspectable. Collapsed mode can stay terse, but when a user toggles expansion on, tool calls should reveal the full command or file operation details needed to understand the action.

## Current State

- `extensions/compact-tools.ts` wraps Pi built-ins with compact rows and clips summaries to 96 characters.
- `bash` is registered as `compactBuiltInTool(createBashToolDefinition, (args) => clip(args.command))`, so the command summary is clipped before rendering.
- `write` already opts into the original expanded call renderer through `renderExpandedCallWithOriginal`, but `bash`, `read`, `edit`, `grep`, `find`, and `ls` do not.
- Expanded rendering currently restores tool result output through the original Pi renderer, but that does not guarantee full call-argument inspection.
- `installShrimpyToolRendering` already propagates `Ctrl+O` expansion state across live and rebuilt tool rows.

## Build

- Make expanded compact built-in tool rows render full inspectable call details instead of clipped summaries.
- Start with `bash`: expanded mode should show the exact command string without the 96-character summary clip.
- Keep collapsed mode compact and unchanged except for any tests that need stable whitespace.
- Reuse Pi's original built-in renderers where they provide good expanded call detail; add small Shrimpy renderers only where the original renderer still hides the useful input.
- Preserve expanded result rendering, including command stdout/stderr behavior from Pi.

## Boundaries

- Do not replace the TUI chat renderer or fork Pi's full tool UI.
- Do not change provider-visible tool call content or session transcript storage.
- Do not make collapsed rows multiline by default.
- Do not add legacy display modes or compatibility shims.

## Implementation Notes

- Likely files: `extensions/compact-tools.ts`, `test/compact-tools-extension.test.ts`, and possibly `src/tui/shrimpy-tool-rendering.ts` if expansion propagation needs coverage.
- `write` demonstrates the existing option shape for using original expanded call rendering.
- If Pi's original `bash` renderer is not inspectable enough, render a Shrimpy expanded call block that includes the exact command text and still leaves result rendering to Pi.
- Add a regression test with a long bash command whose tail is visible only in expanded mode.

## Done

- A long `bash` command remains clipped in collapsed mode and shows a `Ctrl+O` hint.
- The same long command is fully visible when `Ctrl+O` expansion is enabled.
- Expanded mode still shows command output/result details as it does today.
- Existing compact rows for read/write/edit/grep/find/ls keep their collapsed ergonomics.
- Tests cover the bash truncation regression and at least one non-bash compact-tool row to guard the shared path.
