<script lang="ts">
  import { tick } from "svelte";
  import ChannelRow from "./ChannelRow.svelte";
  import JsonViewer from "./JsonViewer.svelte";
  import MarkdownViewer from "./MarkdownViewer.svelte";
  import PathText from "./PathText.svelte";
  import SessionRow from "./SessionRow.svelte";
  import WatchViewer from "./WatchViewer.svelte";
  import type { NodeResponse } from "./types";
  import {
    eventTimestamp,
    formatBytes,
    formatEventDay,
    tailPath,
  } from "./format";
  import { summarizeNode } from "./summary";

  interface Props {
    node: NodeResponse | null;
    loading: boolean;
    error: string | null;
    followLatest: boolean;
    foldNoise: boolean;
    foldTools: boolean;
    live: boolean;
    onFollowLatestChange: (next: boolean) => void;
    onFoldNoiseChange: (next: boolean) => void;
    onFoldToolsChange: (next: boolean) => void;
  }
  let {
    node,
    loading,
    error,
    followLatest,
    foldNoise,
    foldTools,
    live,
    onFollowLatestChange,
    onFoldNoiseChange,
    onFoldToolsChange,
  }: Props = $props();

  let bodyEl: HTMLDivElement | undefined = $state();
  let scrollRequest = 0;
  const FOLLOW_BOTTOM_THRESHOLD = 24;
  const summary = $derived(summarizeNode(node));

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

  function daySeparator(events: unknown[], index: number): string {
    const day = formatEventDay(eventTimestamp(events[index]));
    if (!day) return "";
    const previousDay = index > 0
      ? formatEventDay(eventTimestamp(events[index - 1]))
      : "";
    return day === previousDay ? "" : day;
  }

  $effect(() => {
    if (!node || node.mode !== "jsonl" || !followLatest || loading) return;
    void node.events.length;
    scrollToLatest();
  });
</script>

<section class="view">
  <header class="header">
    <div class="info-row" title={node?.sourcePath}>
      {#if node}
        <span class="identity">
          <span class="kind">{node.kind}</span>
          <strong>{node.label}</strong>
        </span>
        {#each node.metadata as item}
          <span class="info" title={item.label === "path" ? item.value : undefined}>
            <span>{item.label}</span>
            {#if item.label === "path"}
              <PathText path={tailPath(item.value)} />
            {:else}
              {item.value}
            {/if}
          </span>
        {/each}
        {#if node.mode === "jsonl"}
          <span class="info"><span>events</span> {node.events.length}</span>
          <span class="info"><span>size</span> {formatBytes(node.totalSize)}</span>
          {#if summary.partial}
            <span class="scope" title="Summary values cover only the loaded tail of this file">loaded tail</span>
          {/if}
          {#if node.parseErrors.length}
            <span class="err">{node.parseErrors.length} parse err</span>
          {/if}
        {:else if node.mode === "text" || node.mode === "watches"}
          <span class="info"><span>size</span> {formatBytes(node.totalSize)}</span>
          {#if node.truncated}<span class="err">truncated</span>{/if}
        {/if}
        {#each summary.items as item}
          <span class="info summary" title={item.title}>
            <span>{item.label}</span> {item.value}
          </span>
        {/each}
      {:else}
        <span class="muted">select a node</span>
      {/if}
    </div>
    <div class="control-row">
      <div class="controls">
        {#if node?.kind === "session" || node?.kind === "channel"}
          <button
            aria-pressed={foldNoise}
            class:on={foldNoise}
            class="toggle"
            onclick={() => onFoldNoiseChange(!foldNoise)}
          >fold noise</button>
        {/if}
        {#if node?.kind === "session"}
          <button
            aria-pressed={foldTools}
            class:on={foldTools}
            class="toggle"
            onclick={() => onFoldToolsChange(!foldTools)}
          >fold tool I/O</button>
        {/if}
        {#if node?.mode === "jsonl"}
          <button
            aria-pressed={followLatest}
            class:on={followLatest}
            class="toggle"
            onclick={onLatestClick}
          >↓ follow latest</button>
        {/if}
      </div>
      <span class:ok={live} class="connection">{live ? "live" : "reconnecting"}</span>
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
                <dd class={row.tone ?? "normal"}>
                  {#if row.label === "path" || row.label === "root"}
                    <PathText path={row.value} />
                  {:else}
                    {row.value}
                  {/if}
                </dd>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
    {:else if node.mode === "watches"}
      {#if node.watches.length === 0}
        <div class="status muted">(no watches)</div>
      {:else}
        <WatchViewer watches={node.watches} />
      {/if}
    {:else if node.mode === "text"}
      {#if node.text.length === 0}
        <div class="status muted">(empty)</div>
      {:else if node.kind === "markdown"}
        <MarkdownViewer text={node.text} />
      {:else if node.kind === "json" || node.sourcePath?.endsWith(".json")}
        <JsonViewer text={node.text} />
      {:else}
        <pre class="text-file">{node.text}</pre>
      {/if}
    {:else if node.events.length === 0}
      <div class="status muted">(empty)</div>
    {:else if node.kind === "channel"}
      {#each node.events as event, index (eventKey(event, index))}
        {@const day = daySeparator(node.events, index)}
        {#if day}<div class="day">{day}</div>{/if}
        <ChannelRow {event} {foldNoise} />
      {/each}
    {:else}
      {#each node.events as event, index (eventKey(event, index))}
        {@const day = daySeparator(node.events, index)}
        {#if day}<div class="day">{day}</div>{/if}
        <SessionRow {event} {foldNoise} {foldTools} />
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
    grid-template-rows: 36px 24px;
    height: 69px;
    padding: 4px 9px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
    overflow: hidden;
  }
  .info-row {
    display: flex;
    align-content: center;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px 8px;
    min-width: 0;
    overflow: hidden;
    line-height: 16px;
  }
  .identity { display: inline-flex; align-items: baseline; gap: 7px; }
  .identity strong { color: var(--fg-strong); }
  .kind {
    padding: 0 4px;
    border-radius: 2px;
    color: var(--accent);
    background: rgba(248, 131, 121, .1);
    font-size: 10px;
  }
  .info { color: var(--fg-dim); font-size: 10px; white-space: nowrap; }
  .info span { color: var(--fg-muted); }
  .summary { color: var(--fg); }
  .scope {
    padding: 0 4px;
    border-radius: 2px;
    color: var(--c-user);
    background: rgba(224, 185, 106, .1);
    font-size: 10px;
    white-space: nowrap;
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    border-top: 1px solid var(--border);
  }
  .controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }
  .connection { color: var(--c-user); }
  .connection.ok { color: var(--accent); }
  .connection { margin-left: auto; font-size: 10px; }
  .toggle {
    padding: 1px 5px;
    border: 1px solid var(--border);
    border-radius: 2px;
  }
  .toggle:hover { background: var(--bg-hover); }
  .toggle.on { border-color: rgba(248, 131, 121, .45); color: var(--accent); }
  .body {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
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
  .day {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 2px 8px 2px 68px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
    color: var(--fg-muted);
    font-size: 10px;
    letter-spacing: .06em;
  }
  @media (max-width: 720px) {
    .header {
      grid-template-rows: 100px 30px;
      height: 139px;
    }
    .control-row { flex-wrap: wrap; align-content: center; }
  }
  @media (max-width: 560px) {
    .header {
      grid-template-rows: 132px 50px;
      height: 191px;
    }
  }
</style>
