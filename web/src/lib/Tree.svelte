<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Tree, TreeLeaf, TreeNode } from "./types";
  import { formatBytes, formatRelativeTime } from "./format";
  import {
    collectDirectoryIds,
    filterTreeNodes,
    impliedLeafKind,
    isGroupOpen,
  } from "./tree-state";

  interface Props {
    tree: Tree;
    workspace: string;
    selected: string | null;
    openGroups: Record<string, boolean>;
    hidden: boolean;
    onSelect: (id: string) => void;
    onToggle: (key: string) => void;
    onOpenGroupsChange: (groups: Record<string, boolean>) => void;
    onShow: () => void;
    onHide: () => void;
  }

  let {
    tree,
    workspace,
    selected,
    openGroups,
    hidden,
    onSelect,
    onToggle,
    onOpenGroupsChange,
    onShow,
    onHide,
  }: Props = $props();

  let filter = $state("");
  let navEl: HTMLElement | undefined = $state();
  let filterEl: HTMLInputElement | undefined = $state();
  let filteredNodes = $derived(filterTreeNodes(tree.root.children, filter));

  function isOpen(key: string) {
    return filter.trim().length > 0 || isGroupOpen(openGroups, key);
  }

  $effect(() => {
    if (!selected || !navEl) return;
    const item = findItem(selected);
    if (!item) return;
    const navBounds = navEl.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    if (itemBounds.top < navBounds.top) {
      navEl.scrollTop -= navBounds.top - itemBounds.top;
    } else if (itemBounds.bottom > navBounds.bottom) {
      navEl.scrollTop += itemBounds.bottom - navBounds.bottom;
    }
  });

  function selectLeaf(leaf: TreeLeaf) {
    if (leaf.readable) onSelect(leaf.id);
  }

  function findItem(id: string): HTMLButtonElement | null {
    if (!navEl) return null;
    return navEl.querySelector<HTMLButtonElement>(
      `[data-id="${CSS.escape(id)}"]`,
    );
  }

  function visibleItems(selector = "[data-tree-item]"): HTMLButtonElement[] {
    if (!navEl) return [];
    return Array.from(
      navEl.querySelectorAll<HTMLButtonElement>(`${selector}:not(:disabled)`),
    );
  }

  function currentItem(event: KeyboardEvent): HTMLButtonElement | null {
    const target = event.target as Element | null;
    const fromEvent = target?.closest<HTMLButtonElement>("[data-tree-item]");
    if (fromEvent && navEl?.contains(fromEvent)) return fromEvent;
    const active = document.activeElement?.closest<HTMLButtonElement>(
      "[data-tree-item]",
    );
    if (active && navEl?.contains(active)) return active;
    return selected ? findItem(selected) : null;
  }

  function moveVertical(event: KeyboardEvent, delta: number) {
    const leaves = visibleItems("[data-tree-leaf]");
    if (leaves.length === 0) return;
    const current = currentItem(event);
    let index = leaves.findIndex((item) => item === current);
    if (index === -1 && selected) {
      index = leaves.findIndex((item) => item.dataset.id === selected);
    }
    if (index === -1) index = delta > 0 ? -1 : leaves.length;
    const next = leaves[Math.max(0, Math.min(leaves.length - 1, index + delta))];
    if (!next) return;
    const id = next.dataset.id;
    if (id && id !== selected) onSelect(id);
    next.focus();
  }

  function focusParent(item: HTMLButtonElement) {
    const parentId = item.dataset.parentId;
    if (parentId) findItem(parentId)?.focus();
  }

  async function moveHorizontal(event: KeyboardEvent, direction: -1 | 1) {
    const item = currentItem(event);
    if (!item || !navEl?.contains(document.activeElement)) return;
    const id = item.dataset.id;
    if (!id) return;

    if (direction < 0) {
      if (
        item.dataset.type === "directory"
        && isOpen(id)
        && filter.trim().length === 0
      ) {
        onToggle(id);
      } else {
        focusParent(item);
      }
      return;
    }

    if (item.dataset.type !== "directory") return;
    if (!isOpen(id)) {
      onToggle(id);
      return;
    }
    await tick();
    const depth = Number(item.dataset.depth);
    const items = visibleItems();
    const index = items.indexOf(item);
    const child = items.slice(index + 1).find(
      (candidate) => Number(candidate.dataset.depth) === depth + 1,
    );
    child?.focus();
  }

  async function focusFilter() {
    if (hidden) {
      onShow();
      await tick();
    }
    filterEl?.focus();
    filterEl?.select();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = (event.target as HTMLElement | null)?.tagName;

    if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      event.preventDefault();
      void focusFilter();
      return;
    }
    if (event.key === "Escape" && filter) {
      event.preventDefault();
      filter = "";
      return;
    }
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hidden) return;
      event.preventDefault();
      moveVertical(event, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (!navEl?.contains(document.activeElement)) return;
      event.preventDefault();
      void moveHorizontal(event, event.key === "ArrowRight" ? 1 : -1);
    }
  }

  function setAllGroups(open: boolean) {
    const next = { ...openGroups };
    for (const id of collectDirectoryIds(tree.root.children)) next[id] = open;
    onOpenGroupsChange(next);
  }

  function nodeTooltip(node: TreeLeaf): string {
    const details = [
      node.hint,
      node.kind,
      formatBytes(node.size),
      node.mtimeMs ? new Date(node.mtimeMs).toLocaleString() : undefined,
    ].filter(Boolean);
    return `${node.name}\n${details.join(" · ")}`;
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

<aside class="sidebar" class:hidden>
  <header class="brand">
    <span class="mark">🦐</span>
    <span class="title">shrimpy</span>
    <button class="hide-sidebar" onclick={onHide} title="Hide sidebar" aria-label="Hide sidebar">◀</button>
  </header>
  <div class="workspace" title={workspace}>{workspace}</div>
  <div class="tree-tools">
    <input
      bind:this={filterEl}
      bind:value={filter}
      aria-label="Filter tree"
      placeholder="filter  /"
      spellcheck="false"
    />
    <button onclick={() => setAllGroups(false)} title="Collapse all" aria-label="Collapse all">−</button>
    <button onclick={() => setAllGroups(true)} title="Expand all" aria-label="Expand all">+</button>
  </div>
  <nav class="tree" bind:this={navEl}>
    {@render nodeList(filteredNodes, 0, "", true)}
    {#if filteredNodes.length === 0}
      <div class="empty">no matches</div>
    {/if}
  </nav>
</aside>

{#snippet nodeList(
  nodes: TreeNode[],
  depth: number,
  parentId: string,
  parentSynthetic: boolean,
)}
  {@const impliedKind = impliedLeafKind(nodes, parentSynthetic)}
  <ul class="nodes" class:root={depth === 0}>
    {#each nodes as node (node.id)}
      {#if node.type === "directory"}
        <li>
          <button
            class="dir"
            class:synthetic={node.synthetic}
            style={`padding-left: ${8 + depth * 13}px`}
            data-tree-item
            data-id={node.id}
            data-parent-id={parentId}
            data-depth={depth}
            data-type="directory"
            onclick={() => onToggle(node.id)}
          >
            <span class="caret">{isOpen(node.id) ? "▾" : "▸"}</span>
            <span class="node-name">{node.name}</span>
            <span class="count">{node.fileCount}</span>
          </button>
          {#if isOpen(node.id)}
            {@render nodeList(node.children, depth + 1, node.id, node.synthetic ?? false)}
          {/if}
        </li>
      {:else}
        <li class:selected={selected === node.id} class:unreadable={!node.readable}>
          <button
            class="file"
            style={`padding-left: ${27 + depth * 13}px`}
            data-tree-item
            data-tree-leaf
            data-id={node.id}
            data-parent-id={parentId}
            data-depth={depth}
            data-type="file"
            onclick={() => selectLeaf(node)}
            title={nodeTooltip(node)}
            disabled={!node.readable}
          >
            <span class="leaf-name">{node.name}</span>
            {#if node.hint}<span class="hint">{node.hint}</span>{/if}
            {#if impliedKind !== node.kind}<span class="kind">{node.kind}</span>{/if}
            <span class="leaf-time">{formatRelativeTime(node.mtimeMs)}</span>
          </button>
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

<style>
  .sidebar {
    display: grid;
    grid-template-rows: 30px 22px 29px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-raised);
    border-right: 1px solid var(--border);
  }
  .sidebar.hidden { display: none; }
  .brand {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 7px 0 9px;
    border-bottom: 1px solid var(--border);
  }
  .mark { font-size: 15px; }
  .title { color: var(--fg-strong); font-weight: 700; letter-spacing: .03em; }
  .hide-sidebar { margin-left: auto; color: var(--fg-muted); padding: 2px 4px; }
  .hide-sidebar:hover, .tree-tools button:hover { color: var(--fg-strong); background: var(--bg-hover); }
  .workspace {
    padding: 3px 9px;
    color: var(--fg-muted);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }
  .tree-tools {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22px 22px;
    gap: 3px;
    align-items: center;
    padding: 3px 5px;
    border-bottom: 1px solid var(--border);
  }
  .tree-tools input {
    width: 100%;
    min-width: 0;
    height: 21px;
    padding: 1px 6px;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    font: inherit;
    outline: none;
  }
  .tree-tools input:focus { border-color: var(--accent); }
  .tree-tools button { height: 21px; text-align: center; color: var(--fg-muted); }
  .tree { min-height: 0; overflow: auto; padding: 3px 0 18px; }
  .nodes { list-style: none; padding: 0; margin: 0; }
  .dir, .file {
    display: flex;
    align-items: baseline;
    width: 100%;
    min-height: 19px;
    padding-right: 7px;
    gap: 5px;
  }
  .dir:hover, .file:hover, .dir:focus-visible, .file:focus-visible { background: var(--bg-hover); }
  .dir:focus-visible, .file:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
  .dir { color: var(--fg-dim); font-weight: 600; }
  .dir.synthetic { color: var(--fg); }
  .caret { width: 10px; flex: 0 0 auto; color: var(--fg-muted); }
  .node-name, .leaf-name, .hint {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .node-name { min-width: 0; }
  .count { margin-left: auto; color: var(--fg-muted); font-size: 10px; }
  li.selected { background: var(--bg-selected); box-shadow: inset 2px 0 var(--accent); }
  .leaf-name { color: var(--fg); min-width: 40px; flex: 1 1 auto; }
  li.selected .leaf-name { color: var(--fg-strong); }
  li.unreadable .leaf-name { color: var(--fg-muted); }
  .hint {
    max-width: 36%;
    flex: 0 1 auto;
    color: var(--fg-muted);
    font-size: 10px;
  }
  .kind, .leaf-time {
    flex: 0 0 auto;
    color: var(--fg-muted);
    font-size: 9.5px;
  }
  .leaf-time { width: 25px; text-align: right; }
  .file:disabled { cursor: default; }
  .empty { padding: 8px 10px; color: var(--fg-muted); font-size: 10px; }
</style>
