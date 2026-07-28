<script lang="ts">
  import Markdown from "../Markdown.svelte";

  interface Props { text: string; collapsed: boolean; }
  let { text, collapsed }: Props = $props();
  let open = $state(false);
  let appliedCollapsed = $state<boolean | undefined>();

  $effect(() => {
    if (collapsed === appliedCollapsed) return;
    appliedCollapsed = collapsed;
    open = !collapsed;
  });

  const summary = $derived.by(() => {
    const headings = [...text.matchAll(/^#\s+(.+)$/gm)].map((m) => m[1].trim());
    const top = headings.slice(0, 5).join(" · ");
    return top || text.slice(0, 80).replace(/\s+/g, " ");
  });
</script>

<div class="sp" class:open>
  <button class="bar" onclick={() => (open = !open)}>
    <span class="tag">system-prompt</span>
    <span class="len">{text.length.toLocaleString()} chars</span>
    <span class="summary">{summary}</span>
    <span class="caret">{open ? "▾" : "▸"}</span>
  </button>
  {#if open}
    <div class="markdown"><Markdown {text} /></div>
  {/if}
</div>

<style>
  .sp {
    display: block;
    width: 100%;
  }
  .bar {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 6px;
    width: 100%;
    align-items: baseline;
    text-align: left;
  }
  .tag {
    background: rgba(107,208,176,0.18);
    color: var(--accent);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10.5px;
  }
  .len { color: var(--fg-muted); font-size: 10.5px; }
  .summary {
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret { color: var(--fg-muted); }
  .markdown {
    margin-top: 4px;
    padding: 6px 10px;
    background: var(--bg-row);
    border-left: 2px solid var(--accent);
    max-height: 60vh;
    overflow-y: auto;
  }
</style>
