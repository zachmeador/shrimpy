<script lang="ts">
  import type { SessionImageContent } from "../records";

  interface Props extends SessionImageContent {}

  let { data, mimeType }: Props = $props();
  let failed = $state(false);

  const supportedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ]);
  const valid = $derived(supportedMimeTypes.has(mimeType) && data.length > 0);
  const src = $derived(valid ? `data:${mimeType};base64,${data}` : "");
  const approximateBytes = $derived(Math.floor(data.length * 3 / 4));
  const size = $derived(formatBytes(approximateBytes));

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="image-block">
  <div class="image-meta">
    <span class="tag">image</span>
    <span class="muted">{mimeType || "unknown type"} · {size}</span>
  </div>
  {#if src && !failed}
    <img
      src={src}
      alt="Session transcript attachment"
      loading="lazy"
      onerror={() => (failed = true)}
    />
  {:else}
    <span class="unavailable">
      {failed ? "Image could not be decoded." : "Unsupported or empty image payload."}
    </span>
  {/if}
</div>

<style>
  .image-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
    padding-left: 4px;
    border-left: 2px solid var(--border);
  }
  .image-meta {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  img {
    display: block;
    max-width: min(100%, 760px);
    max-height: 520px;
    object-fit: contain;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .unavailable {
    color: var(--c-error);
  }
</style>
