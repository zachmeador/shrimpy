/*
 * The first level: the tide, the agents and the rooms on flecked wool, and
 * who you are on this device, with the time of day.
 */
import type { ComponentChildren } from "preact";
import type { Mode } from "../look/index.ts";
import type { AgentsLevel, Row } from "../view/index.ts";
import { LABELS, OUT_OF_DATE, versionLine } from "../view/index.ts";
import { Fleck, Glyph, Lamp, Sigil, Wordmark } from "./marks.tsx";
import { Tide } from "./tide.tsx";
import { Notes } from "./thread.tsx";
import { CONTROLS } from "./words.ts";

interface RailProps {
  agents: AgentsLevel;
  /** The member IDs of the agents that are running. */
  running: ReadonlySet<string>;
  /** The row whose list is open, by what opens it. */
  current: string | undefined;
  /** What is not working, as the page shows it here: an invitation's refusal, and what the first level says. */
  notes: string[];
  retry: string | undefined;
  me: string | undefined;
  device: string;
  mode: Mode;
  /** Buttons over the tide's right-hand corner. */
  corner: ComponentChildren;
  /** Buttons beside the time of day. */
  footer: ComponentChildren;
  choose: (row: Row) => void;
  toggleMode: () => void;
}

function RailRow({ row, current, running, choose }: { row: Row; current: boolean; running: boolean; choose: () => void }) {
  return (
    <button class={`row${row.look === undefined ? "" : ` pg-${row.look.pigment}`}`} type="button" aria-current={current} onClick={choose}>
      {row.kind === "agent" ? <Sigil look={row.look} off={!running} /> : <span class="hash">#</span>}
      <span class="row-main">
        <b class="who">{row.name}</b>
        <span class={`sub${row.working && row.kind === "agent" ? " busy" : ""}`}>{row.detail}</span>
      </span>
      <span class="row-end">
        {row.unread > 0 && <span class="count">{row.unread}</span>}
        {row.unread > 0 && <Fleck />}
        {row.working && <Lamp />}
      </span>
    </button>
  );
}

export function Rail(props: RailProps) {
  const { agents } = props;
  const [lead, release] = versionLine();
  const agentRows = agents.rows.filter((row) => row.kind === "agent");
  const roomRows = agents.rows.filter((row) => row.kind !== "agent");
  const row = (each: Row) => (
    <RailRow key={each.id} row={each} current={each.id === props.current} running={props.running.has(each.id)} choose={() => props.choose(each)} />
  );
  return (
    <>
      <Tide
        lanterns={agentRows.map((each) => ({ row: each, lit: each.working, running: props.running.has(each.id) }))}
        mode={props.mode}
        choose={props.choose}
      >
        <div class="brand">
          <Wordmark label={agents.title} />
          <span class="rel">
            {lead}
            <em>{release}</em>
          </span>
        </div>
        {props.corner}
      </Tide>
      <Notes notes={props.notes} retry={props.retry} />
      <div class="body">
        <div class="scroll">
          {agentRows.length > 0 && <h2 class="label">{LABELS.agents}</h2>}
          {agentRows.map(row)}
          {roomRows.length > 0 && <h2 class="label">{LABELS.rooms}</h2>}
          {roomRows.map(row)}
          {agents.empty !== undefined && <p class="hint">{agents.empty}</p>}
        </div>
      </div>
      <footer class="me">
        <Sigil look={undefined} />
        <span class="row-main">
          <b>{props.me ?? ""}</b>
          <span class="sub">{agents.stale ? `${props.device} · ${OUT_OF_DATE}` : props.device}</span>
        </span>
        {props.footer}
        <button class="ib" type="button" title={CONTROLS.mode} aria-label={CONTROLS.mode} onClick={props.toggleMode}>
          <Glyph name={props.mode === "dusk" ? "moon" : "sun"} />
        </button>
      </footer>
    </>
  );
}
