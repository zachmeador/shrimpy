<script lang="ts">
  import type { Tree, TreeLeaf, TreeNode } from "./types";
  import { formatBytes } from "./format";

  interface Props {
    tree: Tree;
    workspace: string;
    selected: string | null;
    openGroups: Record<string, boolean>;
    live: boolean;
    onSelect: (id: string) => void;
    onToggle: (key: string) => void;
  }
  let {
    tree,
    workspace,
    selected,
    openGroups,
    live,
    onSelect,
    onToggle,
  }: Props = $props();

  function isOpen(key: string) {
    return openGroups[key] ?? (key !== "directory:workspace");
  }

  let navEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!selected || !navEl) return;
    const escaped = CSS.escape(selected);
    navEl.querySelector<HTMLElement>(`[data-id="${escaped}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  function selectLeaf(leaf: TreeLeaf) {
    if (leaf.readable) onSelect(leaf.id);
  }
</script>

<aside class="sidebar">
  <header class="brand">
    <span class="mark">🦐</span>
    <span class="title">shrimpy</span>
    <span class:online={live} class="live-dot" title={live ? "live" : "reconnecting"}></span>
  </header>
  <div class="workspace" title={workspace}>{workspace}</div>
  <nav class="tree" bind:this={navEl}>
    {@render nodeList(tree.root.children, 0)}
  </nav>
</aside>

{#snippet nodeList(nodes: TreeNode[], depth: number)}
  <ul class="nodes" class:root={depth === 0}>
    {#each nodes as node (node.id)}
      {#if node.type === "directory"}
        <li>
          <button
            class="dir"
            class:synthetic={node.synthetic}
            style={`padding-left: ${8 + depth * 13}px`}
            onclick={() => onToggle(node.id)}
          >
            <span class="caret">{isOpen(node.id) ? "▾" : "▸"}</span>
            <span class="node-name">{node.name}</span>
            <span class="count">{node.fileCount}</span>
          </button>
          {#if isOpen(node.id)}
            {@render nodeList(node.children, depth + 1)}
          {/if}
        </li>
      {:else}
        <li class:selected={selected === node.id} class:unreadable={!node.readable}>
          <button
            class="file"
            style={`padding-left: ${27 + depth * 13}px`}
            data-id={node.id}
            onclick={() => selectLeaf(node)}
            title={node.hint ?? node.name}
            disabled={!node.readable}
          >
            <span class="leaf-name">{node.name}</span>
            {#if node.hint}<span class="hint">{node.hint}</span>{/if}
            <span class="kind">{node.kind}</span>
            {#if node.size > 0}<span class="leaf-size">{formatBytes(node.size)}</span>{/if}
          </button>
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

<style>
  .sidebar {
    display: grid;
    grid-template-rows: 30px 22px minmax(0, 1fr);
    min-width: 0;
    background: var(--bg-raised);
    border-right: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 9px;
    border-bottom: 1px solid var(--border);
  }
  .mark { font-size: 15px; }
  .title { color: var(--fg-strong); font-weight: 700; letter-spacing: .03em; }
  .live-dot {
    width: 6px;
    height: 6px;
    margin-left: auto;
    border-radius: 50%;
    background: var(--c-error);
    box-shadow: 0 0 0 2px rgba(255, 122, 122, .1);
  }
  .live-dot.online {
    background: var(--accent);
    box-shadow: 0 0 0 2px rgba(107, 208, 176, .1);
  }
  .workspace {
    padding: 3px 9px;
    color: var(--fg-muted);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }
  .tree { overflow: auto; padding: 3px 0 18px; }
  .nodes { list-style: none; padding: 0; margin: 0; }
  .dir, .file {
    display: flex;
    align-items: baseline;
    width: 100%;
    min-height: 19px;
    padding-right: 7px;
    gap: 5px;
  }
  .dir:hover, .file:hover { background: var(--bg-hover); }
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
  .leaf-name { color: var(--fg); min-width: 40px; }
  li.selected .leaf-name { color: var(--fg-strong); }
  li.unreadable .leaf-name { color: var(--fg-muted); }
  .hint { flex: 1 1 auto; color: var(--fg-muted); font-size: 10px; }
  .kind, .leaf-size {
    flex: 0 0 auto;
    color: var(--fg-muted);
    font-size: 9.5px;
  }
  .file:disabled { cursor: default; }
</style>
