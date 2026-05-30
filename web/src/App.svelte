<script lang="ts">
  import Tree from "./lib/Tree.svelte";
  import FileView from "./lib/FileView.svelte";
  import { fetchTree, fetchFile } from "./lib/api";
  import type { FileLeaf, FileResponse, TreeNode, TreeResponse } from "./lib/types";

  let treeData = $state<TreeResponse | null>(null);
  let treeError = $state<string | null>(null);

  let selectedPath = $state<string | null>(null);
  let file = $state<FileResponse | null>(null);
  let fileLoading = $state(false);
  let fileError = $state<string | null>(null);

  let openGroups = $state<Record<string, boolean>>({});
  let followLatest = $state(
    typeof localStorage !== "undefined" &&
      localStorage.getItem("shrimpy-web:follow-latest") === "1",
  );
  let requestSeq = 0;

  function onToggleFollow() {
    followLatest = !followLatest;
    try {
      localStorage.setItem("shrimpy-web:follow-latest", followLatest ? "1" : "0");
    } catch {}
  }

  function isOpen(key: string) {
    return openGroups[key] ?? true;
  }

  function onToggle(key: string) {
    openGroups[key] = !(openGroups[key] ?? true);
  }

  const visibleLeaves = $derived.by<FileLeaf[]>(() => {
    if (!treeData) return [];
    const out: FileLeaf[] = [];

    function visit(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file") {
          if (node.readable) out.push(node);
          continue;
        }
        if (!isOpen(node.path)) continue;
        visit(node.children);
      }
    }

    visit(treeData.tree.root.children);
    return out;
  });

  function readHash(): string | null {
    const h = window.location.hash.replace(/^#/, "");
    return h || null;
  }

  async function loadTree() {
    try {
      treeData = await fetchTree();
      treeError = null;
    } catch (e) {
      treeError = e instanceof Error ? e.message : String(e);
    }
  }

  async function loadFile(path: string) {
    selectedPath = path;
    fileLoading = true;
    fileError = null;
    const seq = ++requestSeq;
    try {
      const result = await fetchFile(path);
      if (seq !== requestSeq) return;
      file = result;
    } catch (e) {
      if (seq !== requestSeq) return;
      fileError = e instanceof Error ? e.message : String(e);
      file = null;
    } finally {
      if (seq === requestSeq) fileLoading = false;
    }
  }

  function onSelect(path: string) {
    if (path === selectedPath) return;
    window.location.hash = "#" + path;
    loadFile(path);
  }

  function onRefresh() {
    loadTree();
    if (selectedPath) loadFile(selectedPath);
  }

  function moveSelection(delta: number) {
    const leaves = visibleLeaves;
    if (leaves.length === 0) return;
    let idx = leaves.findIndex((l) => l.path === selectedPath);
    if (idx === -1) {
      idx = delta > 0 ? -1 : leaves.length;
    }
    const next = Math.max(0, Math.min(leaves.length - 1, idx + delta));
    const target = leaves[next];
    if (target && target.path !== selectedPath) onSelect(target.path);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    }
  }

  window.addEventListener("hashchange", () => {
    const p = readHash();
    if (p && p !== selectedPath) loadFile(p);
  });

  window.addEventListener("keydown", onKeydown);

  (async () => {
    await loadTree();
    const p = readHash();
    if (p) await loadFile(p);
  })();
</script>

{#if treeError}
  <div class="fatal">failed to load tree: {treeError}</div>
{:else if treeData}
  <Tree
    tree={treeData.tree}
    selected={selectedPath}
    {openGroups}
    {onSelect}
    {onToggle}
  />
  <FileView
    {file}
    loading={fileLoading}
    error={fileError}
    {followLatest}
    {onRefresh}
    {onToggleFollow}
  />
{:else}
  <div class="status">loading tree…</div>
  <div></div>
{/if}

<style>
  .fatal {
    grid-column: 1 / -1;
    padding: 16px;
    color: var(--c-error);
  }
  .status {
    padding: 16px;
    color: var(--fg-dim);
    border-right: 1px solid var(--border);
    background: var(--bg-raised);
  }
</style>
