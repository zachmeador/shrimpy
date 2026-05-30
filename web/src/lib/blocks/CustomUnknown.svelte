<script lang="ts">
  interface Props { customType: string; data: unknown; }
  let { customType, data }: Props = $props();
  let open = $state(false);

  const isString = $derived(typeof data === "string");
  const body = $derived(
    isString ? (data as string) : JSON.stringify(data, null, 2),
  );
  const summary = $derived(
    isString
      ? `${(data as string).length} chars`
      : Array.isArray(data)
        ? `${data.length} items`
        : typeof data,
  );
</script>

<div class="cu" class:open>
  <button class="bar" onclick={() => (open = !open)}>
    <span class="tag">{customType}</span>
    <span class="len">{summary}</span>
    <span class="caret">{open ? "▾" : "▸"}</span>
  </button>
  {#if open}
    <pre class="body">{body}</pre>
  {/if}
</div>

<style>
  .cu { display: block; width: 100%; }
  .bar {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 6px;
    width: 100%;
    align-items: baseline;
    text-align: left;
  }
  .tag {
    background: var(--bg-row);
    color: var(--fg-dim);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10.5px;
  }
  .len { color: var(--fg-muted); font-size: 10.5px; }
  .caret { color: var(--fg-muted); margin-left: auto; }
  .body {
    margin: 4px 0 0;
    padding: 6px 8px;
    background: var(--bg-row);
    border-left: 2px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
    max-height: 60vh;
    overflow-y: auto;
  }
</style>
