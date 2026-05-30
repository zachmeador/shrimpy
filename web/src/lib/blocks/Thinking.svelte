<script lang="ts">
  interface Props { text: string; }
  let { text }: Props = $props();
  let open = $state(false);
  const preview = $derived(text.split("\n")[0]?.slice(0, 140) ?? "");
</script>

<button class="thinking" class:open onclick={() => (open = !open)}>
  <span class="tag">think</span>
  {#if open}
    <span class="full">{text}</span>
  {:else}
    <span class="preview">{preview}{text.length > preview.length ? "…" : ""}</span>
  {/if}
</button>

<style>
  .thinking {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
    color: var(--c-thinking);
    font-style: italic;
    max-width: 100%;
    text-align: left;
  }
  .thinking .preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thinking.open .full {
    white-space: pre-wrap;
  }
  .thinking .tag {
    background: rgba(138,138,160,0.18);
    color: var(--c-thinking);
    font-style: normal;
  }
</style>
