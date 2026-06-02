# 🦐 TUI-005: Model Switch Message Renderer

Status: todo
Priority: P2
Area: TUI
Depends On: none

## Why

Shrimpy records model switches as visible `shrimpy_model_switch` custom messages so the model can see when the active session model changed. The TUI also gets a transient Pi `showStatus()` row such as `Model: Qwen3.6-27B-UD-Q6_K_XL`.

Today Shrimpy's tool-rendering wrapper rebuilds Pi's chat when `Ctrl+O`
toggles expansion. That rebuild preserves persisted custom messages, but it
drops transient status rows. The fix should make the model switch notice part
of Pi's normal persisted message rendering path instead of preserving loose
status UI rows after a rebuild.

## Build

- Register a Shrimpy renderer for the `shrimpy_model_switch` custom message type.
- In collapsed mode, render a compact inline notice:

  ```text
  Model: Qwen3.6-27B-UD-Q6_K_XL
  ```

- In expanded mode, render the custom-message identity and the exact session-runtime text that participates in the model-visible conversation:

  ```text
  [shrimpy_model_switch]

  [session runtime] Model switched: anthropic/claude-sonnet-4-6 -> local_qwen/Qwen3.6-27B-UD-Q6_K_XL.
  Thinking: off. Earlier assistant messages may be from anthropic/claude-sonnet-4-6.
  ```

- Source the collapsed model label from `details.current.id` when available, falling back to the formatted current model reference or message content only if needed.
- Keep `Ctrl+O` behavior tied to Pi's existing custom-message expansion state.
- Make the persisted `shrimpy_model_switch` custom message the durable visible model-switch row. The transient Pi `showStatus("Model: ...")` may remain best-effort, but correctness should not depend on it.

## Boundaries

- Do not snapshot and reattach `lastStatusText` or other transient Pi status internals as the primary fix.
- Do not fork Pi's TUI rendering or create a parallel chat renderer.
- Do not change what the model sees in the provider-facing session context.
- Do not add migration or compatibility paths.

## Implementation Notes

- Likely files: `src/tui/`, `src/sessions/direct.ts`, and tests near
  `test/tui-tool-rendering.test.ts` or a new TUI renderer test.
- Pi's `CustomMessageComponent` already calls registered message renderers with `{ expanded }`; Shrimpy should use that extension path.
- Current model-switch messages are created in `src/sessions/open.ts` by `appendModelSwitchMessage()`.
- The bug being addressed is a symptom of transient `showStatus()` rows being outside the session render path while Shrimpy rebuilds chat on expansion changes.

## Done

- A model switch renders as `Model: <current model id>` when `Ctrl+O` is collapsed.
- The same row renders the full `shrimpy_model_switch` runtime message when `Ctrl+O` is expanded.
- Toggling `Ctrl+O` does not make the model switch notice disappear.
- The expanded text still matches the content stored in the custom message and visible to the model.
- Tests cover collapsed rendering, expanded rendering, and survival across
  Shrimpy's tool-rendering expansion rebuild.
