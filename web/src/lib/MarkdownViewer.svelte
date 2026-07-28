<script lang="ts">
  import Markdown from "./Markdown.svelte";

  interface Props { text: string; }
  let { text }: Props = $props();
  let raw = $state(false);
</script>

<div class="viewer">
  <button class:on={raw} onclick={() => (raw = !raw)}>
    {raw ? "rendered" : "raw"}
  </button>
  {#if raw}
    <pre>{text}</pre>
  {:else}
    <Markdown {text} />
  {/if}
</div>

<style>
  .viewer { padding: 8px 11px; }
  button {
    float: right;
    margin-left: 8px;
    padding: 1px 5px;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--fg-dim);
  }
  button:hover, button.on { color: var(--accent); border-color: var(--accent); }
  pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;
  }
</style>
