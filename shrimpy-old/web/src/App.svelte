<script lang="ts">
  import { onMount } from "svelte";
  import Tree from "./lib/Tree.svelte";
  import FileView from "./lib/FileView.svelte";
  import { fetchNode, fetchTree } from "./lib/api";
  import { isGroupOpen } from "./lib/tree-state";
  import type {
    JsonlNodeResponse,
    NodeResponse,
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
  let sidebarHidden = $state(false);
  let requestSequence = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  function onToggle(key: string) {
    onOpenGroupsChange({
      ...openGroups,
      [key]: !isGroupOpen(openGroups, key),
    });
  }

  function onOpenGroupsChange(next: Record<string, boolean>) {
    openGroups = next;
    try {
      localStorage.setItem("shrimpy-web:open-groups", JSON.stringify(next));
    } catch {}
  }

  function readOpenGroups(): Record<string, boolean> {
    try {
      const stored = localStorage.getItem("shrimpy-web:open-groups");
      if (!stored) return {};
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, boolean] =>
          typeof entry[1] === "boolean"
        ),
      );
    } catch {
      return {};
    }
  }

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

  function onSidebarHiddenChange(next: boolean) {
    sidebarHidden = next;
    try {
      localStorage.setItem("shrimpy-web:sidebar-hidden", next ? "1" : "0");
    } catch {}
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
    openGroups = readOpenGroups();
    const storedSidebar = localStorage.getItem("shrimpy-web:sidebar-hidden");
    sidebarHidden = storedSidebar === null
      ? window.matchMedia("(max-width: 720px)").matches
      : storedSidebar === "1";
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
    return () => {
      events.close();
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("hashchange", onHashChange);
    };
  });
</script>

{#if treeError}
  <div class="fatal">failed to load workspace: {treeError}</div>
{:else if treeData}
  <main class="app-shell" class:sidebar-hidden={sidebarHidden}>
    <Tree
      tree={treeData.tree}
      workspace={treeData.workspace}
      selected={selectedId}
      {openGroups}
      hidden={sidebarHidden}
      {onSelect}
      {onToggle}
      {onOpenGroupsChange}
      onShow={() => onSidebarHiddenChange(false)}
      onHide={() => onSidebarHiddenChange(true)}
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
    {#if sidebarHidden}
      <button
        class="show-sidebar"
        onclick={() => onSidebarHiddenChange(false)}
        title="Show sidebar"
        aria-label="Show sidebar"
      >▶</button>
    {/if}
  </main>
{:else}
  <div class="status">loading workspace…</div>
{/if}

<style>
  .app-shell {
    position: relative;
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .app-shell.sidebar-hidden { grid-template-columns: minmax(0, 1fr); }
  .show-sidebar {
    position: absolute;
    top: 7px;
    left: 7px;
    z-index: 5;
    width: 20px;
    height: 20px;
    text-align: center;
    color: var(--fg-muted);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 2px;
  }
  .show-sidebar:hover { color: var(--fg-strong); background: var(--bg-hover); }
  .fatal, .status { padding: 16px; color: var(--c-error); }
  @media (max-width: 720px) {
    .app-shell:not(.sidebar-hidden) {
      grid-template-columns: minmax(220px, 78vw) minmax(0, 1fr);
    }
  }
</style>
