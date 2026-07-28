<script lang="ts">
  import { onMount } from "svelte";
  import Tree from "./lib/Tree.svelte";
  import FileView from "./lib/FileView.svelte";
  import { fetchNode, fetchTree } from "./lib/api";
  import type {
    JsonlNodeResponse,
    NodeResponse,
    TreeLeaf,
    TreeNode,
    TreeResponse,
  } from "./lib/types";

  let treeData = $state<TreeResponse | null>(null);
  let treeError = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let node = $state<NodeResponse | null>(null);
  let nodeLoading = $state(false);
  let nodeError = $state<string | null>(null);
  let live = $state(false);
  let openGroups = $state<Record<string, boolean>>({});
  let followLatest = $state(false);
  let foldNoise = $state(true);
  let foldTools = $state(false);
  let requestSequence = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  function isOpen(key: string) {
    return openGroups[key] ?? (key !== "directory:workspace");
  }

  function onToggle(key: string) {
    openGroups[key] = !isOpen(key);
  }

  const visibleLeaves = $derived.by<TreeLeaf[]>(() => {
    if (!treeData) return [];
    const leaves: TreeLeaf[] = [];
    function visit(nodes: TreeNode[]) {
      for (const item of nodes) {
        if (item.type === "file") {
          if (item.readable) leaves.push(item);
        } else if (isOpen(item.id)) {
          visit(item.children);
        }
      }
    }
    visit(treeData.tree.root.children);
    return leaves;
  });

  async function loadTree() {
    try {
      treeData = await fetchTree();
      treeError = null;
    } catch (error) {
      treeError = error instanceof Error ? error.message : String(error);
    }
  }

  async function loadNode(id: string, incremental = false) {
    selectedId = id;
    if (!incremental) nodeLoading = true;
    nodeError = null;
    const sequence = ++requestSequence;
    try {
      const cursor = incremental && node?.mode === "jsonl" && node.id === id
        ? node.cursor
        : undefined;
      const anchor = incremental && node?.mode === "jsonl" && node.id === id
        ? node.anchor
        : undefined;
      const result = await fetchNode(id, cursor, anchor);
      if (sequence !== requestSequence) return;
      node = mergeNode(node, result);
      if (
        result.mode === "jsonl"
        && result.cursor < result.totalSize
        && selectedId === id
      ) {
        queueMicrotask(() => void loadNode(id, true));
      }
    } catch (error) {
      if (sequence !== requestSequence) return;
      nodeError = error instanceof Error ? error.message : String(error);
      if (!incremental) node = null;
    } finally {
      if (sequence === requestSequence) nodeLoading = false;
    }
  }

  function mergeNode(
    current: NodeResponse | null,
    incoming: NodeResponse,
  ): NodeResponse {
    if (
      incoming.mode !== "jsonl"
      || incoming.replace
      || current?.mode !== "jsonl"
      || current.id !== incoming.id
    ) {
      return incoming;
    }
    return {
      ...incoming,
      events: [...current.events, ...incoming.events],
      parseErrors: [...current.parseErrors, ...incoming.parseErrors],
      truncated: current.truncated || incoming.truncated,
    } satisfies JsonlNodeResponse;
  }

  function onSelect(id: string) {
    if (id === selectedId) return;
    window.location.hash = id;
    void loadNode(id);
  }

  function onFollowLatestChange(next: boolean) {
    followLatest = next;
    try {
      localStorage.setItem("shrimpy-web:follow-latest", followLatest ? "1" : "0");
    } catch {}
  }

  function onFoldNoiseChange(next: boolean) {
    foldNoise = next;
    try {
      localStorage.setItem("shrimpy-web:fold-noise", next ? "1" : "0");
    } catch {}
  }

  function onFoldToolsChange(next: boolean) {
    foldTools = next;
    try {
      localStorage.setItem("shrimpy-web:fold-tools", next ? "1" : "0");
    } catch {}
  }

  function moveSelection(delta: number) {
    const leaves = visibleLeaves;
    if (leaves.length === 0) return;
    let index = leaves.findIndex((leaf) => leaf.id === selectedId);
    if (index === -1) index = delta > 0 ? -1 : leaves.length;
    const next = Math.max(0, Math.min(leaves.length - 1, index + delta));
    const target = leaves[next];
    if (target && target.id !== selectedId) onSelect(target.id);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      void loadTree();
      if (selectedId) void loadNode(selectedId, true);
    }, 80);
  }

  onMount(() => {
    followLatest = localStorage.getItem("shrimpy-web:follow-latest") === "1";
    foldNoise = localStorage.getItem("shrimpy-web:fold-noise") !== "0";
    foldTools = localStorage.getItem("shrimpy-web:fold-tools") === "1";
    const initialId = window.location.hash.replace(/^#/, "") || null;
    void (async () => {
      await loadTree();
      if (initialId) await loadNode(initialId);
      else {
        const overview = treeData?.tree.root.children.find(
          (item) => item.type === "file" && item.kind === "overview",
        );
        if (overview?.type === "file") onSelect(overview.id);
      }
    })();
    const events = new EventSource("/api/events");
    events.addEventListener("ready", () => live = true);
    events.addEventListener("change", scheduleRefresh);
    events.onerror = () => live = false;
    const onHashChange = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id && id !== selectedId) void loadNode(id);
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("keydown", onKeydown);
    return () => {
      events.close();
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("keydown", onKeydown);
    };
  });
</script>

{#if treeError}
  <div class="fatal">failed to load workspace: {treeError}</div>
{:else if treeData}
  <Tree
    tree={treeData.tree}
    workspace={treeData.workspace}
    selected={selectedId}
    {openGroups}
    {live}
    {onSelect}
    {onToggle}
  />
  <FileView
    {node}
    loading={nodeLoading}
    error={nodeError}
    {followLatest}
    {foldNoise}
    {foldTools}
    {live}
    {onFollowLatestChange}
    {onFoldNoiseChange}
    {onFoldToolsChange}
  />
{:else}
  <div class="status">loading workspace…</div>
{/if}

<style>
  .fatal, .status { padding: 16px; color: var(--c-error); }
  .fatal { grid-column: 1 / -1; }
</style>
