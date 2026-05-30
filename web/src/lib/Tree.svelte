<script lang="ts">
  import type { FileLeaf, Tree, TreeNode } from "./types";
  import { formatBytes, shortName } from "./format";

  interface Props {
    tree: Tree;
    selected: string | null;
    openGroups: Record<string, boolean>;
    onSelect: (path: string) => void;
    onToggle: (key: string) => void;
  }
  let { tree, selected, openGroups, onSelect, onToggle }: Props = $props();

  function isOpen(key: string) {
    return openGroups[key] ?? true;
  }

  let navEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!selected || !navEl) return;
    const esc = CSS.escape(selected);
    const el = navEl.querySelector<HTMLElement>(`[data-path="${esc}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  });

  function selectFile(leaf: FileLeaf) {
    if (!leaf.readable) return;
    onSelect(leaf.path);
  }
</script>

<nav class="tree" bind:this={navEl}>
  {@render nodeList(tree.root.children, 0)}
</nav>

{#snippet nodeList(nodes: TreeNode[], depth: number)}
  <ul class="nodes" class:root={depth === 0}>
    {#each nodes as node (node.path)}
      {#if node.type === "directory"}
        <li>
          <button
            class="dir"
            style={`padding-left: ${8 + depth * 14}px`}
            onclick={() => onToggle(node.path)}
          >
            <span class="caret">{isOpen(node.path) ? "▾" : "▸"}</span>
            <span class="node-name">{node.name}/</span>
            <span class="count">{node.fileCount}</span>
          </button>
          {#if isOpen(node.path)}
            {@render nodeList(node.children, depth + 1)}
          {/if}
        </li>
      {:else}
        <li class:selected={selected === node.path} class:unreadable={!node.readable}>
          <button
            class="file"
            style={`padding-left: ${28 + depth * 14}px`}
            data-path={node.path}
            onclick={() => selectFile(node)}
            title={node.path}
            disabled={!node.readable}
          >
            <span class="leaf-name">
              {node.kind === "session" ? shortName(node.name) : node.name}
            </span>
            <span class="kind">{node.kind}</span>
            <span class="leaf-size">{formatBytes(node.size)}</span>
          </button>
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

<style>
  .tree {
    height: 100%;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--bg-raised);
    padding: 4px 0;
  }
  .nodes {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .dir {
    display: flex;
    gap: 4px;
    align-items: baseline;
    width: 100%;
    color: var(--fg);
    font-weight: 600;
    min-height: 20px;
  }
  .dir:hover {
    background: var(--bg-hover);
  }
  .caret { width: 10px; color: var(--fg-muted); flex: 0 0 auto; }
  .node-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    margin-left: auto;
    color: var(--fg-muted);
    font-size: 10.5px;
  }
  .nodes li.selected { background: var(--bg-selected); }
  .file {
    display: flex;
    width: 100%;
    gap: 6px;
    align-items: baseline;
    min-height: 18px;
  }
  .file:hover { background: var(--bg-hover); }
  .file:disabled { cursor: default; }
  .leaf-name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
  }
  .nodes li.selected .leaf-name { color: var(--accent); }
  .nodes li.unreadable .leaf-name { color: var(--fg-muted); }
  .kind {
    flex: 0 0 auto;
    color: var(--fg-muted);
    font-size: 10px;
  }
  .leaf-size {
    flex: 0 0 auto;
    color: var(--fg-muted);
    font-size: 10.5px;
  }
</style>
