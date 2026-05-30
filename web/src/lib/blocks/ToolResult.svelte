<script lang="ts">
  import { firstLines } from "../format";

  interface Props {
    toolCallId?: string;
    toolName?: string;
    content: unknown;
    isError?: boolean;
  }
  let { toolCallId, toolName, content, isError }: Props = $props();
  let open = $state(false);

  function extractText(c: unknown): string {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c
        .map((p) => {
          if (p && typeof p === "object" && "text" in p) return String((p as any).text);
          return JSON.stringify(p);
        })
        .join("\n");
    }
    if (c == null) return "";
    return JSON.stringify(c, null, 2);
  }

  const text = $derived(extractText(content));
  const previewData = $derived(firstLines(text, 3));
  const preview = $derived(previewData.preview);
  const more = $derived(previewData.more);
</script>

<button class="tr" class:open class:err={isError} onclick={() => more && (open = !open)}>
  <span class="tag" class:err={isError}>{isError ? "tool-err" : "tool-res"}</span>
  {#if toolName}<span class="muted">{toolName}</span>{/if}
  {#if toolCallId}<span class="muted id">#{toolCallId.slice(-6)}</span>{/if}
  <pre class="body">{open ? text : preview}{!open && more ? "\n…" : ""}</pre>
</button>

<style>
  .tr {
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    gap: 6px;
    align-items: baseline;
    width: 100%;
    text-align: left;
  }
  .tr.err { color: var(--c-error); }
  .tr .body {
    grid-column: 1 / -1;
    margin: 0;
    padding-left: 4px;
    border-left: 2px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--fg);
  }
  .tr.err .body { color: var(--c-error); border-color: var(--c-error); }
  .id { font-size: 10.5px; }
</style>
