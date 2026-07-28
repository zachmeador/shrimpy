<script lang="ts">
  interface Props { path: string; }
  let { path }: Props = $props();
  const pieces = $derived(path.split("/"));
</script>

<span class="path">{#each pieces as piece, index}<span>{piece}</span>{#if index < pieces.length - 1}<span>/</span><wbr />{/if}{/each}</span>

<style>
  .path { min-width: 0; overflow-wrap: anywhere; word-break: normal; }
</style>
