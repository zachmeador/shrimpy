<script lang="ts">
  import { argsOneLine } from "../format";
  interface Props {
    name: string;
    id?: string;
    args: unknown;
    collapsed: boolean;
  }
  let { name, id, args, collapsed }: Props = $props();
  let open = $state(false);
  let appliedCollapsed = $state<boolean | undefined>();
  const oneLine = $derived(argsOneLine(args));

  $effect(() => {
    if (collapsed === appliedCollapsed) return;
    appliedCollapsed = collapsed;
    open = !collapsed;
  });
</script>

<button class="tc" class:open onclick={() => (open = !open)}>
  <span class="tag tool">⚙ {name}</span>
  {#if !open}
    <span class="oneline">({oneLine})</span>
  {:else}
    <pre class="full">{JSON.stringify(args, null, 2)}</pre>
  {/if}
  {#if id}<span class="muted id">#{id.slice(-6)}</span>{/if}
</button>

<style>
  .tc {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
    max-width: 100%;
    text-align: left;
    color: var(--c-tool);
  }
  .tc .tag.tool {
    background: rgba(212,138,107,0.18);
    color: var(--c-tool);
    font-weight: 600;
  }
  .oneline {
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .full {
    margin: 0;
    white-space: pre-wrap;
    color: var(--fg);
  }
  .id { margin-left: auto; font-size: 10.5px; }
</style>
