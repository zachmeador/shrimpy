<script lang="ts">
  import JsonViewer from "./JsonViewer.svelte";
  import type { WatchRow } from "./types";

  interface Props { watches: WatchRow[]; }
  let { watches }: Props = $props();
  let expandedId: string | null = $state(null);

  function nextRun(milliseconds: number | undefined): string {
    return milliseconds ? new Date(milliseconds).toISOString().replace(".000Z", "Z") : "—";
  }
</script>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>id</th>
        <th>name</th>
        <th>trigger</th>
        <th>schedule</th>
        <th>next run</th>
        <th>concurrency</th>
        <th>enabled</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each watches as watch}
        <tr class:disabled={!watch.enabled}>
          <td>{watch.id}</td>
          <td>{watch.name}</td>
          <td>{watch.triggerKind}</td>
          <td>{watch.schedule}</td>
          <td>{nextRun(watch.nextRunAtMs)}</td>
          <td>{watch.concurrencyPolicy}</td>
          <td class:enabled={watch.enabled}>{watch.enabled ? "yes" : "no"}</td>
          <td>
            <button
              aria-expanded={expandedId === watch.id}
              aria-label={expandedId === watch.id ? "Hide raw" : "Show raw"}
              onclick={() => (expandedId = expandedId === watch.id ? null : watch.id)}
            >{expandedId === watch.id ? "−" : "raw"}</button>
          </td>
        </tr>
        {#if expandedId === watch.id}
          <tr class="raw-row">
            <td colspan="8">
              <div class="raw">
                <JsonViewer text={JSON.stringify(watch.raw, null, 2)} />
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap {
    width: 100%;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    padding: 3px 7px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: normal;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  th:nth-child(1) { width: 15%; }
  th:nth-child(2) { width: 22%; }
  th:nth-child(3) { width: 8%; }
  th:nth-child(4) { width: 13%; }
  th:nth-child(5) { width: 20%; }
  th:nth-child(6) { width: 10%; }
  th:nth-child(7) { width: 7%; }
  th:nth-child(8) { width: 5%; }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-raised);
    color: var(--fg-muted);
    font-size: 10px;
    text-transform: uppercase;
  }
  tr.disabled { color: var(--fg-dim); }
  td.enabled { color: var(--accent); }
  button { color: var(--fg-muted); }
  button:hover { color: var(--accent); }
  .raw-row td { padding: 0; }
  .raw {
    width: 100%;
    max-height: 50vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-row);
  }
</style>
