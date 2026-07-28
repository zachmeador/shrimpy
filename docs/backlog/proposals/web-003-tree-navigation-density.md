---
status: draft
priority: P2
area: Web
depends_on: []
---

# 🦐 WEB-003: Tree Navigation Density And Filtering

## Why

The tree is the inspector's primary menu, and on a real workspace it currently spends its width on the least informative fields. Every leaf renders name, hint, kind, and size. Inside the Channels group every kind is `channel`; inside a Sessions group every hint reads `channel · default · active`. The name — the only field that distinguishes one row from another — truncates to eight or ten characters while three redundant columns hold their width.

Sessions are worse than redundant: they carry no time. A single agent shows three sibling rows all named `main`, distinguishable only by byte size, and two sibling rows with the same channel name. The tree sorts by modification time, so the ordering information exists and simply is not displayed.

There is also no way to find anything. A development workspace already reaches a hundred and ten physical files plus twenty-five synthetic agent nodes, all expanded by default on every load, with no filter, no collapse-all, and no persisted expansion state.

## Current State

- `web/src/lib/Tree.svelte` renders each leaf as name, optional hint, kind, and formatted size.
- `web/server/tree.ts` builds session hints as `${namespace} · ${profile} · ${lifecycle}`, which repeats the namespace already shown as the parent group name and the profile that is almost always `default`.
- Session leaves carry `mtimeMs` and sort by it, but `mtimeMs` is never rendered.
- `App.svelte` defaults `isOpen` to true for every group except `directory:workspace`, so Channels, every agent, and every session namespace expand on load.
- Only the follow-latest preference is persisted. Expansion state resets on every reload.
- Keyboard support is ArrowUp and ArrowDown over visible readable leaves. There is no collapse or expand key and no filter.
- Below 720px the sidebar shrinks to 42vw but cannot be hidden, and leaf names truncate further while kind and size keep their width.

## Build

- Drop the `kind` column when the kind is implied by the parent group, and keep it where the group is mixed.
- Rewrite session hints to carry only what the parent group does not: omit the namespace and the default profile, and mark archived sessions rather than labeling every active session.
- Render a relative modification time where the redundant columns were, so sibling `main` sessions are distinguishable by recency.
- Move byte size to the row tooltip.
- Add a filter input above the tree that matches node names and hints, hides non-matching leaves, and keeps ancestor groups of any match visible. Focus it with `/`, clear it with `Escape`.
- Persist expansion state in `localStorage` next to the follow-latest key, and keep the current default expansion for a first visit.
- Add collapse-all and expand-all affordances.
- Extend keyboard navigation with Left to collapse or step to parent and Right to expand or step to first child, keeping the existing arrow behavior for vertical movement.
- Add a sidebar hide toggle, and hide the sidebar by default below the narrow breakpoint so the body gets the full width on a phone.

## UX Implications

Tree rows lead with the name at usable width and end with a relative time, so the three sibling `main` sessions and the two same-named channel sessions become tellable apart at a glance. Redundant `channel` and `default` labels disappear; archived sessions gain a marker where every session previously claimed to be active. Byte size moves from the row to the tooltip, which is a small loss for anyone who was scanning sizes.

Pressing `/` filters the tree by name, which is the fastest path to a node in a workspace with a hundred-plus files. Expansion state survives reload, so returning to the inspector no longer means re-collapsing everything, and collapse-all gives a way back to a short tree.

Left and Right arrows change meaning inside the tree: they collapse and expand rather than doing nothing. On narrow viewports the sidebar starts hidden and is reachable by toggle, which changes the first-load appearance on a phone.

## Boundaries

- Filtering is a client-side view over the loaded tree. Do not add a server search endpoint in this item; workspace content search is a separate concern from tree navigation.
- Do not remove access to the physical workspace tree. Synthetic groups and real paths both stay reachable.
- Do not ask Shrimpy core to persist tree presentation state or emit view-specific hints.
- Do not add mutation, rename, or delete affordances to tree rows.
- Keep live tree updates intact: filtering, persisted expansion, and hiding must preserve selection, scroll position, and incremental refresh.

## Notes

Relative time needs a rule for how it refreshes. Recomputing on every live tree refresh is probably enough; a dedicated timer is likely more machinery than the gain justifies.

## Touches

- `web/src/lib/Tree.svelte`
- `web/src/App.svelte` for expansion persistence, filter state, and keyboard handling
- `web/server/tree.ts` for session hint content
- `web/src/app.css` for the sidebar grid and narrow-viewport behavior
- `test/web-tree.test.ts` for hint shape

## Done

- Leaf rows lead with a name at usable width and show a relative modification time.
- Redundant kind and profile labels are gone, and archived sessions are marked.
- The tree can be filtered from the keyboard, and matches keep their ancestors visible.
- Expansion state persists across reloads, with collapse-all and expand-all available.
- Left and Right collapse and expand, and the sidebar can be hidden.
- Live tree refresh still preserves selection, expansion, and scroll position.
