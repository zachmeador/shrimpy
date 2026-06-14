# 🦐 TUI-008: Resume Preview Context Stripping

Status: review
Priority: P2
Area: TUI
Depends On: none

## Why

Shrimpy prepends turn context to user prompts so the model sees live workspace, channel, and agent context. The TUI chat view strips that leading `<context>...</context>` envelope when collapsed, but Pi's `/resume` selector builds its row preview from the session name or first message outside Shrimpy's chat-rendering hook. Sessions whose first user message was created by Shrimpy therefore show the context block in every `/resume` row preview, making the picker noisy and hiding the actual prompt the user wants to recognize.

The resume picker should show the human prompt preview by default. Context can remain in the transcript and model-visible session data; the selector is a navigation surface.

## Current State

- `src/tui/shrimpy-context-rendering.ts` wraps `InteractiveMode.addMessageToChat()` and uses `stripPromptTurnContextForDisplay()` to hide leading turn context from collapsed chat rows.
- That hook only affects messages rendered into chat. It does not affect Pi's `/resume` selector.
- Pi's `SessionSelectorComponent` renders the session display text from `session.name ?? session.firstMessage`, normalizes control characters, and truncates the result.
- The Shrimpy prompt envelope is stable: `<context>`, `[turn-context]`, `</context>`, the instruction line, then the actual user prompt.

## Build

- Make Shrimpy's TUI resume previews strip the leading turn-context envelope before rows are rendered.
- Reuse `stripPromptTurnContextForDisplay()` or a tiny exported display helper so chat rows and selector previews cannot drift.
- Apply the sanitizer only to display text for unnamed sessions whose preview comes from the first user message. Named sessions should continue to show their name unchanged.
- Keep the stored session entry, provider-visible prompt, and resumed session contents unchanged.
- Cover both interactive `/resume` and startup resume picker behavior if both use the same Pi `SessionSelectorComponent` path in the installed Pi version.

## Boundaries

- Do not remove turn context from persisted session transcripts.
- Do not change context assembly, turn-context rendering, or the model-visible prompt format.
- Do not fork Pi's full session selector.
- Do not add legacy preview formats or migration code.

## Implementation Notes

- Likely files: `src/tui/shrimpy-context-rendering.ts`, `src/tui/interactive.ts`, and a focused TUI selector test. If startup `--resume` is wrapped separately, check the Pi `cli/session-picker` path too.
- The likely Pi touchpoint is `SessionSelectorComponent` from `@earendil-works/pi-coding-agent`, which is used by `InteractiveMode.showSessionSelector()` and Pi's `--resume` picker.
- Prefer a narrow wrapper or display-sanitizer seam around session rows over changing Shrimpy session metadata. If Pi grows a selector display hook, use that instead of patching private component internals.
- Existing tests in `test/tui-context-rendering.test.ts` already cover the stripping helper and chat path; add a regression that a session first message built with `formatPromptWithTurnContext()` renders as the bare prompt in the selector preview.

## Done

- `/resume` rows for unnamed Shrimpy sessions show the actual user prompt, not `<context>`, `[turn-context]`, runtime context text, or the turn-context instruction.
- Named sessions still show the session name.
- Selecting a sanitized row resumes the original session with its full transcript intact.
- Collapsed and expanded chat rendering behavior remains unchanged.
- Focused tests cover the polluted-preview regression.
