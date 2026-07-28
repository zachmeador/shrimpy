<script lang="ts">
  interface Props { text: string; }
  let { text }: Props = $props();
</script>

<span class="text">{text}</span>

<style>
  .text {
    display: block;
    max-width: 78ch;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
