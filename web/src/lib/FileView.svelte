<script lang="ts">
  import { tick } from "svelte";
  import ChannelRow from "./ChannelRow.svelte";
  import SessionRow from "./SessionRow.svelte";
  import type { FileResponse } from "./types";
  import { formatBytes } from "./format";

  interface Props {
    file: FileResponse | null;
    loading: boolean;
    error: string | null;
    followLatest: boolean;
    onRefresh: () => void;
    onToggleFollow: () => void;
  }
  let {
    file,
    loading,
    error,
    followLatest,
    onRefresh,
    onToggleFollow,
  }: Props = $props();

  let bodyEl: HTMLDivElement | undefined = $state();
  let scrollRequest = 0;

  function scrollToLatest() {
    const request = ++scrollRequest;
    void (async () => {
      await tick();
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (request !== scrollRequest || !bodyEl) return;
        bodyEl.scrollTop = bodyEl.scrollHeight;
      }
    })();
  }

  function scrollToTop() {
    scrollRequest++;
    void tick().then(() => {
      if (bodyEl) bodyEl.scrollTop = 0;
    });
  }

  function onLatestClick() {
    const willEnable = !followLatest;
    onToggleFollow();
    if (willEnable) {
      scrollToLatest();
    } else {
      scrollToTop();
    }
  }

  $effect(() => {
    if (!file || !followLatest || loading) return;
    void file;
    scrollToLatest();
  });
</script>

<section class="view">
  <header class="header">
    <div class="path">
      {#if file}
        <span class="kind">{file.kind}</span>
        <span class="path-text">{file.path}</span>
      {:else}
        <span class="muted">select a file</span>
      {/if}
    </div>
    <div class="meta">
      {#if file}
        {#if file.mode === "jsonl"}
          <span>{file.events.length} events</span>
          <span>·</span>
        {/if}
        <span>{formatBytes(file.totalSize)}</span>
        {#if file.truncated}<span class="err">· truncated</span>{/if}
        {#if file.mode === "jsonl" && file.parseErrors.length}
          <span class="err">· {file.parseErrors.length} parse err</span>
        {/if}
      {/if}
      <button
        class="btn toggle"
        class:on={followLatest}
        onclick={onLatestClick}
        title="Jump to latest entries when opening a file"
      >↓ latest</button>
      <button class="btn" onclick={onRefresh} disabled={loading}>⟳ refresh</button>
    </div>
  </header>

  <div class="body" bind:this={bodyEl}>
    {#if loading}
      <div class="status">loading…</div>
    {:else if error}
      <div class="status err">{error}</div>
    {:else if !file}
      <div class="status muted">Pick a file on the left.</div>
    {:else if file.mode === "text"}
      {#if file.text.length === 0}
        <div class="status muted">(empty)</div>
      {:else}
        <pre class="text-file">{file.text}</pre>
      {/if}
    {:else}
      {#if file.events.length === 0}
        <div class="status muted">(empty)</div>
      {:else if file.kind === "channel"}
        {#each file.events as ev, i (i)}
          <ChannelRow event={ev} />
        {/each}
      {:else}
        {#each file.events as ev, i (i)}
          <SessionRow event={ev} />
        {/each}
      {/if}
    {/if}
    {#if file && file.mode === "jsonl" && file.parseErrors.length}
      <div class="errors">
        <strong>Parse errors:</strong>
        {#each file.parseErrors as pe}
          <div class="err">line {pe.line}: {pe.error}</div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .view {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
    overflow: hidden;
  }
  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
  }
  .path {
    display: flex;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    align-items: baseline;
  }
  .kind {
    flex: 0 0 auto;
    font-size: 10.5px;
    padding: 0 4px;
    background: var(--bg-row);
    color: var(--fg-dim);
    border-radius: 2px;
  }
  .path-text {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
  }
  .meta {
    display: flex;
    gap: 6px;
    align-items: baseline;
    justify-content: flex-end;
    min-width: max-content;
    color: var(--fg-dim);
    font-size: 10.5px;
  }
  .btn {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--fg-dim);
    white-space: nowrap;
  }
  .btn:hover { background: var(--bg-hover); color: var(--fg); }
  .btn.toggle.on {
    background: rgba(107,208,176,0.14);
    border-color: rgba(107,208,176,0.4);
    color: var(--accent);
  }
  .body {
    overflow-y: auto;
    overflow-x: auto;
  }
  .status { padding: 16px; }
  .text-file {
    margin: 0;
    padding: 10px 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--fg);
    font: inherit;
  }
  .errors {
    padding: 8px 10px;
    border-top: 1px solid var(--border);
    background: rgba(255,122,122,0.06);
  }

  @media (max-width: 680px) {
    .header {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .meta {
      justify-content: flex-start;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: thin;
    }
  }
</style>
