<script lang="ts">
  import { formatEventTime } from "./format";

  interface Normalized {
    timestamp: number;
    senderKind: "human" | "agent" | "system" | string;
    actorId: string;
    provenance: string;
    contentType: string;
    text: string;
    raw: any;
  }

  interface Props { event: any; }
  let { event }: Props = $props();

  function normalize(e: any): Normalized {
    if (e.sender && e.content) {
      const data = e.content?.data;
      const publication = data?.publication;
      const text = formatContent(e.content?.type, data)
        + (publication?.kind
          ? ` · ${publication.kind}${publication.urgency ? `/${publication.urgency}` : ""}`
          : "");
      const provenance = [
        e.origin?.transport,
        e.origin?.addressedAgentId ? `→${e.origin.addressedAgentId}` : "",
        e.origin?.watchId ? `watch:${e.origin.watchId}` : "",
        e.origin?.sourceKind && e.origin?.sourceId
          ? `${e.origin.sourceKind}:${e.origin.sourceId}`
          : "",
      ].filter(Boolean).join(" ");
      return {
        timestamp: e.timestamp ?? 0,
        senderKind: e.sender?.kind ?? "unknown",
        actorId:
          e.sender?.displayName ??
          e.sender?.actorId ??
          e.sender?.userId ??
          "?",
        provenance,
        contentType: e.content?.type ?? "?",
        text: typeof text === "string" ? text : JSON.stringify(text),
        raw: e,
      };
    }
    return {
      timestamp: e.timestamp ?? 0,
      senderKind: "unknown",
      actorId: "?",
      provenance: "unknown",
      contentType: e.type ?? "?",
      text: JSON.stringify(e),
      raw: e,
    };
  }

  function formatContent(type: unknown, data: any): string {
    if (type === "text") return typeof data?.text === "string" ? data.text : JSON.stringify(data);
    if (type === "image") return [data?.caption, data?.path].filter(Boolean).join(" · ");
    if (type === "image_group") {
      const paths = Array.isArray(data?.paths) ? data.paths.join(", ") : "";
      return [data?.caption, paths].filter(Boolean).join(" · ");
    }
    if (type === "unsupported_media") {
      return [data?.mediaKind, data?.caption, data?.fileName].filter(Boolean).join(" · ");
    }
    return JSON.stringify(data ?? {});
  }

  const n = $derived(normalize(event));

  function chipClass(kind: string): string {
    if (kind === "human") return "h";
    if (kind === "agent") return "a";
    if (kind === "system") return "s";
    return "";
  }
  function chipLetter(kind: string): string {
    if (kind === "human") return "H";
    if (kind === "agent") return "A";
    if (kind === "system") return "S";
    return "?";
  }

  let expanded = $state(false);
</script>

<div class="row" class:expanded>
  <span class="ts">{formatEventTime(n.timestamp)}</span>
  <span class="chip {chipClass(n.senderKind)}">{chipLetter(n.senderKind)}</span>
  <span class="actor">{n.actorId}</span>
  <span class="transport dim" title={n.provenance}>{n.provenance}</span>
  <span class="content">{n.text}</span>
  <button class="more" onclick={() => (expanded = !expanded)} title="raw">{expanded ? "−" : "⋯"}</button>
  {#if expanded}
    <pre class="raw">{JSON.stringify(n.raw, null, 2)}</pre>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 104px 14px 140px minmax(90px, 160px) 1fr 18px;
    gap: 6px;
    padding: 2px 8px;
    align-items: baseline;
    border-bottom: 1px solid var(--bg-row);
  }
  .row:hover { background: var(--bg-hover); }
  .ts { color: var(--fg-dim); font-size: 10.5px; }
  .actor {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .transport {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
  }
  .content {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .more {
    color: var(--fg-muted);
    justify-self: end;
  }
  .raw {
    grid-column: 1 / -1;
    margin: 4px 0 0;
    padding: 4px 8px;
    background: var(--bg-row);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
    color: var(--fg-dim);
  }
</style>
