<script lang="ts">
  interface Props {
    label: string;
    summary: string;
    body: string;
    collapsed: boolean;
  }

  let { label, summary, body, collapsed }: Props = $props();
  let open = $state(false);
  let appliedCollapsed = $state<boolean | undefined>();

  $effect(() => {
    if (collapsed === appliedCollapsed) return;
    appliedCollapsed = collapsed;
    open = !collapsed;
  });
</script>

<div class="folded" class:open>
  <button class="bar" onclick={() => (open = !open)}>
    <span class="tag">{label}</span>
    {#if !open}<span class="summary">{summary}</span>{/if}
    <span class="caret">{open ? "▾" : "▸"}</span>
  </button>
  {#if open}
    <pre class="body">{body}</pre>
  {/if}
</div>

<style>
  .folded { display: block; width: 100%; min-width: 0; }
  .bar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    width: 100%;
    align-items: baseline;
    text-align: left;
  }
  .summary {
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret { color: var(--fg-muted); }
  .body {
    margin: 4px 0 0;
    padding: 6px 8px;
    max-height: 60vh;
    overflow-y: auto;
    border-left: 2px solid var(--border);
    background: var(--bg-row);
    color: var(--fg-dim);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
  }
</style>
