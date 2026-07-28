---
status: draft
priority: P3
area: Web
depends_on: []
---

# 🦐 WEB-004: Node Viewers And Transcript Legibility

## Why

Several node kinds get their own synthetic tree entry and their own `kind` label, then render as undifferentiated text. Watches is the clearest case: it has a dedicated node, and it answers the question people actually bring to the inspector — why did that not fire — but it prints raw JSON, so the `enabled` flag that explains the answer is buried in a blob. Markdown files render as preformatted text even though the inspector already renders markdown for system prompts with a compact stylesheet.

Separately, the transcript's visual system does not carry the distinctions it encodes. Row separators use a colour three values away from the background, and role tinting sits at four percent alpha on near-black, so rows visually merge into one paragraph and user turns look identical to agent turns. The information is in the DOM and not on the screen.

## Current State

- The Watches node reads `watches.json` and renders it as text. A workspace where every watch has `"enabled": false` looks the same as one where every watch is armed.
- JSON renders in one flat `--fg` colour with no distinction between keys, strings, numbers, and booleans, across watches, config, and runtime state nodes.
- `.md` files render inside `<pre>`. `SystemPrompt.svelte` already renders markdown through markdown-it with a dense stylesheet that would suit them.
- The Agent summary node shows five rows — id, root, sessions, watches, SOUL.md — three of which repeat the header metadata, in a narrow column against a mostly empty viewport.
- `.row` borders in `SessionRow.svelte` and `ChannelRow.svelte` use `--bg-row` at `#111114` against `--bg` at `#0e0e10`.
- `.is-user` tints at `rgba(224,185,106,0.04)` and `.is-tool` at `rgba(212,138,107,0.04)`.
- `formatEventTime` in `web/src/lib/format.ts` renders same-day records as `HH:MM:SS.mmm` and other-day records as `MM/DD HH:MM:SS`, so one fixed-width column carries two formats with no day separators.
- Message content spans a `1fr` column with no maximum width, so prose runs the full viewport on a wide display.
- Long paths break mid-word under `overflow-wrap: anywhere`, splitting a path into fragments like `shr` and `impy`.
- The connection dot uses `--c-error` while reconnecting, so a routine SSE reconnect reads as a failure.

## Build

- Give Watches a table viewer: id, name, trigger kind, schedule, next run, concurrency policy, and enabled state, with the raw record available on expand. Read `state/watch-clock.json` for next-run information where it is available.
- Add JSON key and value colouring for JSON-backed nodes, reusing the existing palette rather than introducing new hues.
- Render `.md` nodes through the markdown renderer already used for system prompts, with a raw toggle.
- Expand the Agent summary beyond header restatement: last activity, model policy, channel memberships, session counts by namespace, and watch enablement counts.
- Raise row separators to `--border`, or drop them for an alternating tint, so rows read as rows.
- Replace the near-invisible role tint with a two-pixel left border in the role colour, which reads immediately and costs no vertical space.
- Normalise the timestamp column to one format with day-separator rows between records from different days, and drop milliseconds from the default view.
- Give message prose a maximum line width so text stays readable on a wide display, while keeping code, raw JSON, and tabular content full width.
- Break long paths at separators instead of at arbitrary characters.
- Use a distinct colour for reconnecting and reserve red for a sustained connection failure.

## UX Implications

Watches becomes readable at a glance, including the enabled state that determines whether anything runs. JSON gains colour, markdown files render as prose with a raw escape hatch, and the Agent summary answers something rather than repeating the header.

Transcripts gain visible row boundaries and a left border marking who spoke, so scanning a session no longer requires reading to find the turn boundaries. Timestamps use one format with day separators instead of silently switching format across a day boundary, and lose milliseconds from the default view — a small loss for anyone reading fine-grained ordering, which the raw record still carries. Prose gets a reading measure while code and structured content keep the full width.

A reconnect stops looking like an error.

## Boundaries

- Do not add editing to any viewer. The inspector stays read-only.
- Do not render untrusted workspace content as HTML. Markdown rendering keeps HTML disabled, as `SystemPrompt.svelte` already does.
- Do not introduce a new colour system. Extend the existing variables in `web/src/app.css`.
- Do not add readers for watch or config shapes Shrimpy no longer writes.
- Keep the dense character: compact rows, low chrome, restrained colour. No card grids.
- Do not ask Shrimpy core to emit next-run or enablement summaries for the web viewer's benefit.

## Touches

- `web/src/lib/FileView.svelte` and new viewer components under `web/src/lib/`
- `web/src/lib/SessionRow.svelte`, `web/src/lib/ChannelRow.svelte`
- `web/src/lib/format.ts`
- `web/src/app.css`
- `web/server/nodes.ts` for the agent summary rows

## Done

- Watches renders as a table including enabled state and next run, with raw available.
- JSON nodes are colour-coded and markdown nodes render as prose with a raw toggle.
- The Agent summary carries activity, model policy, memberships, and counts.
- Row boundaries and speaker roles are visible without reading the text.
- Timestamps use one format with day separators, and prose has a reading measure.
- Reconnecting is visually distinct from failure.
