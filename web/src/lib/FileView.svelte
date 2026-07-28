<script lang="ts">
  import { tick } from "svelte";
  import ChannelRow from "./ChannelRow.svelte";
  import SessionRow from "./SessionRow.svelte";
  import type { NodeResponse } from "./types";
  import { formatBytes } from "./format";

  interface Props {
    node: NodeResponse | null;
    loading: boolean;
    error: string | null;
    followLatest: boolean;
    live: boolean;
    onFollowLatestChange: (next: boolean) => void;
  }
  let {
    node,
    loading,
    error,
    followLatest,
    live,
    onFollowLatestChange,
  }: Props = $props();

  let bodyEl: HTMLDivElement | undefined = $state();
  let scrollRequest = 0;
  const FOLLOW_BOTTOM_THRESHOLD = 24;

  function scrollToLatest() {
    const request = ++scrollRequest;
    void (async () => {
      await tick();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (request !== scrollRequest || !bodyEl || !followLatest) return;
      bodyEl.scrollTop = bodyEl.scrollHeight;
    })();
  }

  function onBodyScroll() {
    if (
      !followLatest
      || !bodyEl
      || bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight
        <= FOLLOW_BOTTOM_THRESHOLD
    ) {
      return;
    }
    scrollRequest++;
    onFollowLatestChange(false);
  }

  function eventKey(event: unknown, index: number): string {
    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      return `event:${index}`;
    }
    const id = (event as Record<string, unknown>).id;
    return typeof id === "string" && id
      ? `event:${index}:${id}`
      : `event:${index}`;
  }

  function onLatestClick() {
    const enabling = !followLatest;
    onFollowLatestChange(enabling);
    if (enabling) scrollToLatest();
  }

  $effect(() => {
    if (!node || node.mode !== "jsonl" || !followLatest || loading) return;
    void node.events.length;
    scrollToLatest();
  });
</script>

<section class="view">
  <header class="header">
    <div class="identity">
      {#if node}
        <span class="kind">{node.kind}</span>
        <strong>{node.label}</strong>
        {#each node.metadata as item}
          <span class="metadata"><span>{item.label}</span> {item.value}</span>
        {/each}
      {:else}
        <span class="muted">select a node</span>
      {/if}
    </div>
    <div class="meta">
      <span class:ok={live} class="connection">{live ? "live" : "reconnecting"}</span>
      {#if node?.mode === "jsonl"}
        <span>{node.events.length} events</span>
        <span>{formatBytes(node.totalSize)}</span>
        {#if node.truncated}<span class="err">tail</span>{/if}
        {#if node.parseErrors.length}<span class="err">{node.parseErrors.length} parse err</span>{/if}
        <button
          class:on={followLatest}
          class="toggle"
          onclick={onLatestClick}
        >↓ follow</button>
      {:else if node?.mode === "text"}
        <span>{formatBytes(node.totalSize)}</span>
        {#if node.truncated}<span class="err">truncated</span>{/if}
      {/if}
    </div>
  </header>

  <div class="body" bind:this={bodyEl} onscroll={onBodyScroll}>
    {#if loading}
      <div class="status">loading…</div>
    {:else if error}
      <div class="status err">{error}</div>
    {:else if !node}
      <div class="status muted">Choose something from the tree.</div>
    {:else if node.mode === "overview"}
      <div class="overview">
        {#each node.sections as section}
          <section class="overview-section">
            <h2>{section.title}</h2>
            <dl>
              {#each section.rows as row}
                <dt>{row.label}</dt>
                <dd class={row.tone ?? "normal"}>{row.value}</dd>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
    {:else if node.mode === "text"}
      {#if node.text.length === 0}
        <div class="status muted">(empty)</div>
      {:else}
        <pre class="text-file">{node.text}</pre>
      {/if}
    {:else if node.events.length === 0}
      <div class="status muted">(empty)</div>
    {:else if node.kind === "channel"}
      {#each node.events as event, index (eventKey(event, index))}
        <ChannelRow {event} />
      {/each}
    {:else}
      {#each node.events as event, index (eventKey(event, index))}
        <SessionRow {event} />
      {/each}
    {/if}
    {#if node?.mode === "jsonl" && node.parseErrors.length}
      <div class="errors">
        {#each node.parseErrors as parseError}
          <div class="err">line {parseError.line}: {parseError.error}</div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .view { display: grid; grid-template-rows: auto 1fr; min-width: 0; min-height: 0; }
  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 31px;
    padding: 4px 9px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
  }
  .identity, .meta { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
  .identity { overflow: hidden; white-space: nowrap; }
  .identity strong { color: var(--fg-strong); }
  .kind {
    padding: 0 4px;
    border-radius: 2px;
    color: var(--accent);
    background: rgba(107, 208, 176, .1);
    font-size: 10px;
  }
  .metadata {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg-dim);
    font-size: 10px;
  }
  .metadata span { color: var(--fg-muted); }
  .meta { justify-content: flex-end; color: var(--fg-dim); font-size: 10px; }
  .connection { color: var(--c-error); }
  .connection.ok { color: var(--accent); }
  .toggle {
    padding: 1px 5px;
    border: 1px solid var(--border);
    border-radius: 2px;
  }
  .toggle:hover { background: var(--bg-hover); }
  .toggle.on { border-color: rgba(107, 208, 176, .45); color: var(--accent); }
  .body { overflow: auto; }
  .status { padding: 12px; }
  .text-file {
    margin: 0;
    padding: 9px 11px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;
  }
  .overview {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1px;
    padding: 1px;
    background: var(--border);
  }
  .overview-section { padding: 10px 12px; background: var(--bg); }
  .overview-section h2 {
    margin: 0 0 7px;
    color: var(--fg-strong);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  dl {
    display: grid;
    grid-template-columns: minmax(90px, .35fr) 1fr;
    gap: 3px 10px;
    margin: 0;
  }
  dt { color: var(--fg-muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  dd.good { color: var(--accent); }
  dd.warn { color: var(--c-user); }
  dd.bad { color: var(--c-error); }
  dd.dim { color: var(--fg-dim); }
  .errors { padding: 7px 9px; border-top: 1px solid var(--border); }
  @media (max-width: 720px) {
    .header { grid-template-columns: 1fr; }
    .meta { justify-content: flex-start; }
  }
</style>
