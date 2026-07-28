<script lang="ts">
  import MarkdownIt from "markdown-it";

  interface Props { text: string; }
  let { text }: Props = $props();

  const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
  const rendered = $derived(md.render(text));
</script>

<div class="md">{@html rendered}</div>

<style>
  .md {
    min-width: 0;
    max-width: 78ch;
    overflow-wrap: anywhere;
  }
  .md :global(h1), .md :global(h2), .md :global(h3), .md :global(h4) {
    margin: 10px 0 2px;
    color: var(--accent);
    font-size: 12px;
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
    padding: 0 3px;
    border-radius: 2px;
    background: var(--bg);
    color: var(--fg);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .md :global(pre) {
    width: 100%;
    margin: 4px 0;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .md :global(pre code) {
    padding: 0;
    background: transparent;
  }
  .md :global(hr) {
    margin: 8px 0;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .md :global(blockquote) {
    margin: 4px 0;
    padding-left: 8px;
    border-left: 2px solid var(--border);
    color: var(--fg-dim);
  }
  .md :global(strong) { color: var(--fg); }
  .md :global(a) { color: var(--c-agent); }
  .md :global(table) {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .md :global(th), .md :global(td) {
    padding: 2px 6px;
    border: 1px solid var(--border);
    text-align: left;
    overflow-wrap: anywhere;
  }
</style>
