<script lang="ts">
  import FoldedRecord from "./blocks/FoldedRecord.svelte";
  import { formatEventTime } from "./format";
  import {
    classifyChannelRecord,
    type RecordClassification,
  } from "./records";

  interface Normalized {
    timestamp: number;
    senderKind: "human" | "agent" | "system" | string;
    actorId: string;
    provenance: string;
    contentType: string;
    text: string;
    classified: RecordClassification;
    raw: any;
  }

  interface Props { event: any; foldNoise: boolean; }
  let { event, foldNoise }: Props = $props();

  function normalize(e: any): Normalized {
    if (e.sender && e.content) {
      const classified = classifyChannelRecord(e);
      const data = e.content?.data;
      const publication = data?.publication;
      const text = (classified.text ?? classified.summary)
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
        classified,
        raw: e,
      };
    }
    const classified = classifyChannelRecord(e);
    return {
      timestamp: e.timestamp ?? 0,
      senderKind: "unknown",
      actorId: "?",
      provenance: "unknown",
      contentType: e.type ?? "?",
      text: classified.summary,
      classified,
      raw: e,
    };
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

<div
  class="row"
  class:expanded
  class:is-human={n.senderKind === "human"}
  class:is-agent={n.senderKind === "agent"}
  class:is-system={n.senderKind === "system"}
>
  <span class="ts">{formatEventTime(n.timestamp)}</span>
  <span class="chip {chipClass(n.senderKind)}">{chipLetter(n.senderKind)}</span>
  <span class="actor">{n.actorId}</span>
  <span class="transport dim" title={n.provenance}>{n.provenance}</span>
  <span class="content">
    {#if n.classified.foldClass === "noise"}
      <FoldedRecord
        label={n.classified.label}
        summary={n.classified.summary}
        body={n.classified.body}
        collapsed={foldNoise}
      />
    {:else}
      {n.text}
    {/if}
  </span>
  <button class="more" onclick={() => (expanded = !expanded)} title="raw">{expanded ? "−" : "⋯"}</button>
  {#if expanded}
    <pre class="raw">{JSON.stringify(n.raw, null, 2)}</pre>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 58px 14px 140px minmax(90px, 160px) 1fr 18px;
    gap: 6px;
    padding: 2px 8px 2px 6px;
    align-items: baseline;
    border-bottom: 1px solid var(--border);
    border-left: 2px solid transparent;
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
    min-width: 0;
    max-width: 90ch;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
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
    overflow-wrap: anywhere;
    font-size: 11px;
    color: var(--fg-dim);
  }
  .is-human { border-left-color: var(--c-human); }
  .is-agent { border-left-color: var(--c-agent); }
  .is-system { border-left-color: var(--c-system); }
</style>
