---
status: todo
priority: P2
area: Web
depends_on:
  - WEB-001
---

# 🦐 WEB-002: Two-Row Inspector Header With Info And Controls

## Why

The inspector header currently packs identity, metadata, derived statistics, connection status, and the follow-latest control into a single row. The two halves compete: node metadata truncates on the left while status text and the toggle hold fixed width on the right. On a session node the header shows a truncated `name prof…` and a base64url session path fragment, which is the least useful information available about that node.

The header is also the only place in the inspector with room for summary information. A session's model, thinking level, message counts, cost, and time span are all derivable from records the view has already loaded, and none of it is shown. Splitting the header into an information row and a control row gives the summary somewhere to live and gives the fold controls from [WEB-001](web-001-record-rendering-and-folding.md) a home that does not squeeze it.

## Current State

- `web/src/lib/FileView.svelte` renders one header row as a two-column grid: an `.identity` cluster of kind chip, label, and `node.metadata` pairs, and a right-justified `.meta` cluster of connection status, event count, byte size, truncation and parse-error markers, and the follow toggle.
- `.identity` sets `overflow: hidden; white-space: nowrap`, so metadata silently truncates as the control cluster grows.
- Connection state renders twice on screen: as a dot in the `Tree.svelte` brand row and as text in this header.
- Node metadata comes from the server as `NodeMetadata` label/value pairs in `web/shared/types.ts`. Session metadata includes the encoded session path, which is not readable.
- Below 720px the header collapses to a single column and the control cluster wraps under the identity cluster.

## Build

- Split the header into two rows inside the existing header region, keeping total height tight enough that the body still dominates the viewport.
- Row one carries identity and information: kind chip, node label, node metadata, and the derived statistics that currently sit in the right cluster — event count, byte size, tail and truncation markers, parse-error count. Let this row use the full width so metadata stops competing with controls.
- Row two carries controls on the left and status on the right: fold noise, fold tool I/O, follow latest, and the connection indicator.
- Show only the controls that apply to the selected node kind. Fold tool I/O and follow latest are meaningless on a text or overview node and should not render there.
- Extend row one with per-kind summary information derived from records the client already holds, so the header answers what the node is without scrolling:
  - Sessions: model and provider, thinking level, message counts by role, tool-call count, total cost, first and last record time, active or archived.
  - Channels: member agents, sender breakdown, first and last record time.
  - Text and runtime nodes: modified time and size.
- Compute summary values in a pure module so they are testable, and derive them from loaded records rather than adding a server endpoint or asking Shrimpy to persist a view model.
- Replace the encoded session path in session metadata with a readable agent, namespace, name, and profile breakdown. Keep the physical path available on hover.
- Drop the duplicate connection text or the sidebar dot so connection state appears in one place.
- Give the two rows a stable height so switching nodes does not shift the body's scroll position.
- Below 720px, keep the two-row split and allow each row to wrap rather than collapsing back to one column.

## UX Implications

The header grows from one row to two, costing a small amount of vertical space and buying a readable metadata line plus a summary of the selected node. Session and channel nodes gain at-a-glance answers — which model, how many turns, what it cost, over what span — that previously required scrolling the transcript or opening raw records.

Fold controls become visible and discoverable rather than implicit, and they sit next to follow-latest so the reading controls are one cluster. Controls that do not apply to the selected node kind disappear rather than rendering disabled, so the control row stays short.

Connection status appears once instead of twice. Session identity stops showing an encoded directory fragment. Nothing currently reachable is removed; the physical path stays available on hover.

## Boundaries

- Do not add a server endpoint or a persisted view model to supply header summary values. Derive them from records the client already loaded, and omit values that cannot be derived.
- Do not turn the header into a dashboard. It stays a dense two-row strip with the body dominating.
- Do not add controls beyond the fold pair from WEB-001 and the existing follow-latest toggle in this item.
- Do not add mutation controls. The inspector stays read-only.
- Do not ask Shrimpy core to emit web-specific metadata to make the header nicer.

## Notes

The summary is bounded by what has been loaded. Sessions load incrementally and long files can be tail-truncated, so counts and cost must be labeled honestly as covering the loaded range rather than presented as whole-file totals.

## Touches

- `web/src/lib/FileView.svelte`
- `web/src/lib/Tree.svelte` for the duplicated connection indicator
- `web/server/nodes.ts` for readable session metadata pairs
- New summary module under `web/src/lib/`
- `web/src/app.css` for the header grid
- `test/web-tree.test.ts` or a focused node-metadata test

## Done

- The header renders an information row and a control row, and node metadata no longer truncates against the control cluster.
- Session and channel nodes show a derived summary in the header, labeled honestly when the loaded range is partial.
- Fold and follow controls sit together and render only for node kinds where they apply.
- Session identity shows readable agent, namespace, name, and profile instead of an encoded path.
- Connection status appears in exactly one place.
- The header keeps a stable height across node switches and stays two rows below 720px.
