<script lang="ts">
  import Text from "./blocks/Text.svelte";
  import Thinking from "./blocks/Thinking.svelte";
  import ToolCall from "./blocks/ToolCall.svelte";
  import ToolResult from "./blocks/ToolResult.svelte";
  import SystemPrompt from "./blocks/SystemPrompt.svelte";
  import ToolsList from "./blocks/ToolsList.svelte";
  import CustomUnknown from "./blocks/CustomUnknown.svelte";
  import { tsFromIso, formatEventTime } from "./format";

  interface Props { event: any; }
  let { event }: Props = $props();

  const ts = $derived(
    typeof event.timestamp === "string"
      ? tsFromIso(event.timestamp)
      : event.timestamp ?? 0,
  );
  const type = $derived(event.type as string);
  const role = $derived(event.message?.role as string | undefined);

  function roleChip(r: string | undefined): { cls: string; letter: string } {
    if (r === "user") return { cls: "u", letter: "U" };
    if (r === "assistant") return { cls: "a", letter: "A" };
    if (r === "toolResult") return { cls: "t", letter: "T" };
    if (r === "system") return { cls: "s", letter: "S" };
    return { cls: "", letter: "?" };
  }

  const chip = $derived(roleChip(role));

  let expanded = $state(false);

  function fmtCost(n: number | undefined): string {
    if (!n) return "0";
    if (n < 0.01) return `$${n.toFixed(5)}`;
    return `$${n.toFixed(4)}`;
  }
</script>

<div class="row type-{type}" class:is-user={role === "user"} class:is-assistant={role === "assistant"} class:is-tool={role === "toolResult"}>
  <span class="ts">{formatEventTime(ts)}</span>

  {#if type === "session"}
    <span class="tag">session</span>
    <span class="content dim">v{event.version} · cwd={event.cwd} · id={(event.id as string)?.slice(0, 8)}</span>
  {:else if type === "model_change"}
    <span class="tag">model</span>
    <span class="content">{event.provider}/<strong>{event.modelId}</strong></span>
  {:else if type === "thinking_level_change"}
    <span class="tag">think-lvl</span>
    <span class="content">{event.thinkingLevel}</span>
  {:else if type === "custom"}
    <span class="content">
      {#if event.customType === "shrimpy_system_prompt" && typeof event.data === "string"}
        <SystemPrompt text={event.data} />
      {:else if event.customType === "shrimpy_tools" && Array.isArray(event.data)}
        <ToolsList tools={event.data} />
      {:else}
        <CustomUnknown customType={event.customType ?? "custom"} data={event.data} />
      {/if}
    </span>
  {:else if type === "message"}
    <span class="chip {chip.cls}">{chip.letter}</span>
    <span class="content blocks">
      {#each event.message?.content ?? [] as block, i}
        {@const bt = block?.type}
        {#if bt === "text"}
          <Text text={block.text ?? ""} />
        {:else if bt === "thinking"}
          <Thinking text={block.thinking ?? ""} />
        {:else if bt === "toolCall"}
          <ToolCall name={block.name ?? "?"} id={block.id} args={block.arguments ?? {}} />
        {:else if bt === "toolResult"}
          <ToolResult
            toolCallId={block.toolCallId ?? block.tool_call_id}
            toolName={block.toolName}
            content={block.content}
            isError={block.isError}
          />
        {:else}
          <span class="tag">{bt ?? "?"}</span>
          <span class="dim">{JSON.stringify(block)}</span>
        {/if}
      {/each}
      {#if role === "toolResult"}
        <ToolResult
          toolCallId={event.message?.toolCallId}
          toolName={event.message?.toolName}
          content={event.message?.content}
          isError={event.message?.isError}
        />
      {/if}
    </span>
    {#if event.message?.usage}
      {@const u = event.message.usage}
      <span class="usage muted">
        {u.input ?? 0}→{u.output ?? 0}
        {#if u.cacheRead}·cr:{u.cacheRead}{/if}
        {#if u.cacheWrite}·cw:{u.cacheWrite}{/if}
        {#if u.cost?.total != null}·{fmtCost(u.cost.total)}{/if}
      </span>
    {/if}
  {:else}
    <span class="tag">{type ?? "?"}</span>
    <span class="content dim">{JSON.stringify(event)}</span>
  {/if}

  <button class="more" onclick={() => (expanded = !expanded)} title="raw">{expanded ? "−" : "⋯"}</button>
  {#if expanded}
    <pre class="raw">{JSON.stringify(event, null, 2)}</pre>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 104px 14px 1fr auto 18px;
    gap: 6px;
    padding: 2px 8px;
    align-items: baseline;
    border-bottom: 1px solid var(--bg-row);
  }
  .row:hover { background: var(--bg-hover); }
  .row.type-session, .row.type-model_change, .row.type-thinking_level_change {
    grid-template-columns: 104px auto 1fr 18px;
    color: var(--fg-dim);
  }
  .row.type-custom {
    grid-template-columns: 104px 1fr 18px;
  }
  .row.type-session .tag { background: rgba(107,208,176,0.18); color: var(--accent); }
  .ts { color: var(--fg-dim); font-size: 10.5px; }
  .content { min-width: 0; word-break: break-word; }
  .blocks {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .usage {
    font-size: 10.5px;
    justify-self: end;
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
  .is-user { background: rgba(224,185,106,0.04); }
  .is-assistant { }
  .is-tool { background: rgba(212,138,107,0.04); }
</style>
