<script lang="ts">
  interface ToolSpec {
    name: string;
    description?: string;
    parameters?: unknown;
    sourceInfo?: { source?: string; scope?: string; path?: string; origin?: string };
  }

  interface Props { tools: ToolSpec[]; }
  let { tools }: Props = $props();
  let open = $state(false);
  let expanded = $state<Record<string, boolean>>({});

  const summary = $derived(
    tools
      .slice(0, 6)
      .map((t) => t.name)
      .join(", ") + (tools.length > 6 ? ", …" : ""),
  );
</script>

<div class="tl" class:open>
  <button class="bar" onclick={() => (open = !open)}>
    <span class="tag">tools</span>
    <span class="len">{tools.length}</span>
    <span class="summary">{summary}</span>
    <span class="caret">{open ? "▾" : "▸"}</span>
  </button>
  {#if open}
    <div class="list">
      {#each tools as tool (tool.name)}
        {@const isOpen = expanded[tool.name] ?? false}
        <button class="tool" onclick={() => (expanded[tool.name] = !isOpen)}>
          <span class="name">{tool.name}</span>
          {#if tool.sourceInfo?.source}
            <span class="src">{tool.sourceInfo.source}</span>
          {/if}
          <span class="desc">{tool.description ?? ""}</span>
          <span class="caret">{isOpen ? "▾" : "▸"}</span>
          {#if isOpen}
            <pre class="params">{JSON.stringify(tool.parameters ?? {}, null, 2)}</pre>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tl { display: block; width: 100%; }
  .bar {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 6px;
    width: 100%;
    align-items: baseline;
    text-align: left;
  }
  .tag {
    background: rgba(212,138,107,0.18);
    color: var(--c-tool);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10.5px;
    font-weight: 600;
  }
  .len { color: var(--fg-muted); font-size: 10.5px; }
  .summary {
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret { color: var(--fg-muted); }
  .list {
    margin-top: 4px;
    padding: 4px 0;
    background: var(--bg-row);
    border-left: 2px solid var(--c-tool);
  }
  .tool {
    display: grid;
    grid-template-columns: 110px auto 1fr auto;
    gap: 6px;
    width: 100%;
    padding: 1px 10px;
    align-items: baseline;
    text-align: left;
    border-bottom: 1px solid transparent;
  }
  .tool:hover { background: var(--bg-hover); }
  .name { color: var(--c-tool); font-weight: 600; }
  .src {
    font-size: 10px;
    padding: 0 3px;
    color: var(--fg-muted);
    background: var(--bg);
    border-radius: 2px;
  }
  .desc {
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .params {
    grid-column: 1 / -1;
    margin: 2px 0 4px;
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-size: 11px;
    white-space: pre-wrap;
    color: var(--fg);
  }
</style>
