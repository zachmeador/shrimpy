<script lang="ts">
  import { formatEventTime } from "./format";

  interface Normalized {
    timestamp: number;
    senderKind: "human" | "agent" | "system" | string;
    actorId: string;
    transport: string;
    contentType: string;
    text: string;
    raw: any;
  }

  interface Props { event: any; }
  let { event }: Props = $props();

  function normalize(e: any): Normalized {
    if (e.sender && e.content) {
      const text =
        e.content?.data?.text ??
        (e.content?.type === "system" ? JSON.stringify(e.content.data) : "") ??
        "";
      return {
        timestamp: e.timestamp ?? 0,
        senderKind: e.sender?.kind ?? "unknown",
        actorId:
          e.sender?.displayName ??
          e.sender?.actorId ??
          e.sender?.userId ??
          "?",
        transport: e.origin?.transport ?? "",
        contentType: e.content?.type ?? "?",
        text: typeof text === "string" ? text : JSON.stringify(text),
        raw: e,
      };
    }
    // legacy from/type/payload
    return {
      timestamp: e.timestamp ?? 0,
      senderKind: e.from ?? "unknown",
      actorId: e.from ?? "?",
      transport: e.type ?? "",
      contentType: e.type ?? "?",
      text:
        typeof e.payload === "string"
          ? e.payload
          : JSON.stringify(e.payload ?? {}),
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

<div class="row" class:expanded>
  <span class="ts">{formatEventTime(n.timestamp)}</span>
  <span class="chip {chipClass(n.senderKind)}">{chipLetter(n.senderKind)}</span>
  <span class="actor">{n.actorId}</span>
  <span class="transport dim">{n.transport}</span>
  <span class="content">{n.text}</span>
  <button class="more" onclick={() => (expanded = !expanded)} title="raw">{expanded ? "−" : "⋯"}</button>
  {#if expanded}
    <pre class="raw">{JSON.stringify(n.raw, null, 2)}</pre>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 104px 14px 140px 70px 1fr 18px;
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
