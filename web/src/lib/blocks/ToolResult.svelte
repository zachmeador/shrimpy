<script lang="ts">
  import { firstLines } from "../format";
  import {
    sessionImages,
    stringifyRecord,
  } from "../records";
  import ImageBlock from "./ImageBlock.svelte";

  interface Props {
    toolCallId?: string;
    toolName?: string;
    content: unknown;
    isError?: boolean;
    collapsed: boolean;
  }
  let { toolCallId, toolName, content, isError, collapsed }: Props = $props();
  let open = $state(false);
  let appliedCollapsed = $state<boolean | undefined>();

  function extractText(c: unknown): string {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c
        .map((p) => {
          if (p && typeof p === "object" && "text" in p) return String((p as any).text);
          if (p && typeof p === "object" && "type" in p && (p as any).type === "image") {
            return "";
          }
          return stringifyRecord(p);
        })
        .filter(Boolean)
        .join("\n");
    }
    if (c == null) return "";
    return stringifyRecord(c);
  }

  const text = $derived(extractText(content));
  const images = $derived(sessionImages(content));
  const previewData = $derived(firstLines(text, 3));
  const preview = $derived(previewData.preview);
  const more = $derived(previewData.more);
  const summary = $derived(
    [
      text ? `${text.length.toLocaleString()} chars` : "",
      images.length ? `${images.length} image${images.length === 1 ? "" : "s"}` : "",
      more ? "multi-line" : "",
    ].filter(Boolean).join(" · ") || "empty",
  );

  $effect(() => {
    if (collapsed === appliedCollapsed) return;
    appliedCollapsed = collapsed;
    open = !collapsed;
  });
</script>

<button class="tr" class:open class:err={isError} onclick={() => (open = !open)}>
  <span class="tag" class:err={isError}>{isError ? "tool-err" : "tool-res"}</span>
  {#if toolName}<span class="muted">{toolName}</span>{/if}
  {#if toolCallId}<span class="muted id">#{toolCallId.slice(-6)}</span>{/if}
  {#if collapsed && !open}
    <span class="muted summary">{summary}</span>
  {:else}
    {#if text}
      <pre class="body">{open ? text : preview}{!open && more ? "\n…" : ""}</pre>
    {/if}
    {#if open}
      {#each images as image}
        <div class="image">
          <ImageBlock {...image} />
        </div>
      {/each}
    {/if}
  {/if}
</button>

<style>
  .tr {
    display: grid;
    grid-template-columns: auto auto auto minmax(0, 1fr);
    gap: 6px;
    align-items: baseline;
    width: 100%;
    text-align: left;
  }
  .tr.err { color: var(--c-error); }
  .tr .body {
    grid-column: 1 / -1;
    margin: 0;
    padding-left: 4px;
    border-left: 2px solid var(--border);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--fg);
  }
  .tr.err .body { color: var(--c-error); border-color: var(--c-error); }
  .image {
    grid-column: 1 / -1;
    min-width: 0;
  }
  .id { font-size: 10.5px; }
  .summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
