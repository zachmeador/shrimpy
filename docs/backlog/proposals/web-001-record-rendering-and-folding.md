---
status: todo
priority: P1
area: Web
depends_on: []
---

# 🦐 WEB-001: Session And Channel Record Rendering And Folding

## Why

The inspector's session view is currently dominated by machine scaffolding rather than conversation. Three separate defects compound: unhandled event types dump raw JSON inline with no truncation and no toggle, tool results render their body twice, and injected turn-context preambles are indistinguishable from human-authored message text. On a real workspace session the scaffolding occupies roughly two thirds of the transcript, so the view fails at its primary job of letting someone read what happened.

Folding is the structural fix rather than a preference. Every session carries a predictable set of high-volume, low-attention records; the renderer should classify them once and give the reader a way to collapse the whole class.

## Current State

- `web/src/lib/SessionRow.svelte` handles `session`, `model_change`, `thinking_level_change`, `custom`, and `message` event types. Its final `{:else}` branch renders `JSON.stringify(event)` with no truncation and no expand control.
- Pi emits `custom_message` events, which are not one of the handled types. Every `shrimpy_turn_context` record therefore hits the fallback branch and prints roughly thirty lines of escaped JSON, including a `details.text` field that duplicates the same text a second time. This fires once per user turn.
- For `role === "toolResult"` messages, `SessionRow.svelte` iterates `message.content` blocks — which renders the text parts — and then renders `<ToolResult>` against the same `message.content`. The body appears twice on every tool result.
- Channel-sourced user messages carry a `[turn-context]` block plus channel instructions ahead of the human message. These are genuine message text, so no fallback is involved, but the human sentence can sit forty lines below the top of its own row.
- `custom` events already fold correctly through `CustomUnknown.svelte`, and `SystemPrompt.svelte` and `ToolsList.svelte` fold with useful summaries. The folding vocabulary exists; the noisiest records do not use it.
- `ChannelRow.svelte` renders non-text content types through `JSON.stringify`, so membership and policy records appear as raw objects in the content column.
- The inspector has no client-side test harness. `test/web-*.test.ts` exercise the server readers against temporary workspace fixtures only.

## Build

- Route the `SessionRow.svelte` fallback branch through `CustomUnknown.svelte` so unhandled event types fold to a one-line summary with an expandable body, matching how `custom` already behaves. No event type should be able to print an unbounded blob by default.
- Give `custom_message` a first-class branch that shows the `customType` tag and a short summary, folded by default, with the payload available on expand.
- Remove the duplicate tool-result render: for `role === "toolResult"` messages, render the body once. Decide between the block loop and the explicit `ToolResult` call and delete the other path.
- Detect the injected preamble at the head of message text — the `[turn-context]` block and the channel-instruction preamble that follows it — and fold it into a labeled `context` affordance, leaving the human-authored remainder expanded. Fold only a recognized leading prefix; never fold text the classifier does not positively identify.
- Extract the classification into a pure module under `web/src/lib/` — something like `records.ts` — that maps a raw record to a fold class, a one-line summary, and a body. Keep the Svelte components rendering decisions the module makes so the behavior is testable without a browser.
- Define the fold classes the surfaces share: `noise` for injected scaffolding, system prompts, tool manifests, custom records, and channel state records; `tool` for tool calls and tool results; `content` for human and agent message text, which never folds by default.
- Add two fold controls, persisted in `localStorage` alongside the existing follow-latest key:
  - Fold noise, default on, collapsing the `noise` class in both sessions and channels.
  - Fold tool I/O, default off, collapsing `tool` calls and results to one line each. Session views only.
- Keep per-record toggles working when a class-level fold is active, so opening one record does not require turning the whole class back on.
- Apply the same classification to `ChannelRow.svelte` so membership, policy, and other non-text content records fold as `noise` instead of printing raw objects.
- Cover the classifier with tests over representative records: `custom_message` turn context, a tool-result message, a channel-preamble user message, an unknown event type, an unknown channel content type, and a plain text message that must not fold.

## UX Implications

Opening a session shows conversation first. Injected turn context, system prompts, tool manifests, and custom records appear as single labeled lines that expand on click, and the duplicated tool-result body disappears. A channel-sourced user turn shows the human sentence with a folded `context` marker above it rather than forty lines of preamble.

Two new controls appear in the inspector header, described in [WEB-002](web-002-two-row-inspector-header.md). Fold noise defaults on, which changes what an existing user sees on first load after the change; the control makes the old behavior one click away. Fold tool I/O defaults off so tool activity stays visible unless the reader asks for a tighter view. Both settings persist across reloads and apply to whichever node is selected.

Nothing becomes unreachable. Every folded record keeps its per-record expand control, and the existing raw-JSON toggle on each row still shows the untouched record. The inspector stays read-only.

## Boundaries

- Do not change what Shrimpy writes to session or channel JSONL to make rendering easier. The renderer learns the current shapes.
- Do not drop records. Folding hides a body behind a control; it never removes a row or filters a record out of the view.
- Do not treat workspace content as HTML. Folded summaries and expanded bodies stay text.
- Do not add readers for record shapes Shrimpy no longer writes.
- Do not grow the control set beyond the two fold controls in this item. Filtering, search, and per-role visibility belong elsewhere.
- Keep classification in a pure module rather than spreading record-shape knowledge across Svelte components.

## Touches

- `web/src/lib/SessionRow.svelte`
- `web/src/lib/ChannelRow.svelte`
- `web/src/lib/blocks/CustomUnknown.svelte`, `web/src/lib/blocks/ToolResult.svelte`
- New `web/src/lib/records.ts` classification module
- `web/src/lib/FileView.svelte` for control state plumbing
- A focused classifier test under `test/`

## Done

- No event type or content type can render an unbounded raw payload by default.
- Tool results render their body exactly once.
- Injected turn-context and channel preambles fold behind a labeled control, leaving human text visible.
- Fold noise and fold tool I/O work across sessions and channels, persist across reloads, and do not break per-record toggles.
- Channel state records fold instead of printing raw objects.
- Classification is covered by tests over representative records including unknown shapes.
