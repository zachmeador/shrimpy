<script lang="ts">
  import MarkdownIt from "markdown-it";

  interface Props { text: string; }
  let { text }: Props = $props();
  let open = $state(false);

  const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
  const rendered = $derived(md.render(text));

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
    <div class="md">{@html rendered}</div>
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
  .md {
    margin-top: 4px;
    padding: 6px 10px;
    background: var(--bg-row);
    border-left: 2px solid var(--accent);
    max-height: 60vh;
    overflow-y: auto;
  }
  .md :global(h1), .md :global(h2), .md :global(h3), .md :global(h4) {
    margin: 10px 0 2px;
    font-size: 12px;
    color: var(--accent);
    font-weight: 700;
  }
  .md :global(h1) { font-size: 13px; }
  .md :global(p) { margin: 2px 0; }
  .md :global(ul), .md :global(ol) {
    margin: 2px 0;
    padding-left: 18px;
  }
  .md :global(li) { margin: 0; }
  .md :global(code) {
    background: var(--bg);
    padding: 0 3px;
    border-radius: 2px;
    font-size: 11px;
    color: var(--fg);
  }
  .md :global(pre) {
    margin: 4px 0;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow-x: auto;
  }
  .md :global(pre code) {
    background: transparent;
    padding: 0;
  }
  .md :global(hr) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 8px 0;
  }
  .md :global(blockquote) {
    margin: 4px 0;
    padding-left: 8px;
    border-left: 2px solid var(--border);
    color: var(--fg-dim);
  }
  .md :global(strong) { color: var(--fg); }
  .md :global(a) { color: var(--c-agent); }
</style>
