<script lang="ts">
  interface Props { text: string; }
  let { text }: Props = $props();
</script>

<span class="text">{text}</span>

<style>
  .text {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
