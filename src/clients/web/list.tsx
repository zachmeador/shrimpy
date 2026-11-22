/*
 * The second level: everything one agent takes part in, your threads with it
 * apart from the rest, or the threads of a room or of a channel only read.
 */
import type { ComponentChildren } from "preact";
import type { ListFilter, ListLevel, Row } from "../view/index.ts";
import { FILTERS, LABELS, READ_ONLY_TAG, thenStart } from "../view/index.ts";
import { Fleck, Glyph, Lamp, Sigil } from "./marks.tsx";
import { Notes } from "./thread.tsx";
import type { Tab } from "./address.ts";
import { CONTROLS, NEW_THREAD, NEW_THREAD_KEY } from "./words.ts";

function ThreadRow({ row, current, open }: { row: Row; current: boolean; open: () => void }) {
  return (
    <button class={`trow${row.unread > 0 ? " unread" : ""}`} type="button" aria-current={current} onClick={open}>
      <span class="t-title">{row.label}</span>
      <span class={`t-sub${row.working ? " busy" : ""}`}>{row.detail}</span>
      <span class="t-end">
        {row.unread > 0 && <span class="count">{row.unread}</span>}
        {row.unread > 0 && <Fleck />}
        {row.working && <Lamp />}
      </span>
    </button>
  );
}

interface ListProps {
  list: ListLevel;
  /** What the agent's row on the first level says of it, and whether it runs. */
  agent: { detail: string; working: boolean; running: boolean } | undefined;
  readOnly: boolean;
  /** An agent's tab on show, and what its triggers and home tabs hold. */
  tab: Tab;
  tabs: { triggers: ComponentChildren; home: ComponentChildren };
  filter: ListFilter;
  /** The row that is open, by what opens it. */
  current: string | undefined;
  retry: string | undefined;
  back: () => void;
  start: () => void;
  open: (row: Row) => void;
  setFilter: (filter: ListFilter) => void;
  setTab: (tab: Tab) => void;
}

const TABS: readonly Tab[] = ["threads", "triggers", "home"];
const SHOWS: readonly ListFilter[] = ["everything", "yours"];

export function ListView(props: ListProps) {
  const { list } = props;
  const rows = (each: Row[]) =>
    each.map((row) => <ThreadRow key={row.id} row={row} current={row.id === props.current} open={() => props.open(row)} />);
  const yours = list.rows.filter((row) => row.yours);
  const elsewhere = list.rows.filter((row) => !row.yours);
  return (
    <>
      <header class={`head${list.look === undefined ? "" : ` pg-${list.look.pigment}`}`}>
        <button class="ib only-narrow" type="button" aria-label={CONTROLS.backToAgents} onClick={props.back}>
          <Glyph name="back" />
        </button>
        {list.look !== undefined && <Sigil look={list.look} size="s36" off={props.agent?.running === false} />}
        <div class="titles">
          <h1>
            {list.name}
            {props.readOnly && <span class="tag">{READ_ONLY_TAG}</span>}
          </h1>
          {props.agent !== undefined && <p class={`sub${props.agent.working ? " busy" : ""}`}>{props.agent.detail}</p>}
        </div>
        {list.startable && (
          <button class="ib" type="button" title={NEW_THREAD} aria-label={NEW_THREAD} onClick={props.start}>
            <Glyph name="plus" />
          </button>
        )}
      </header>
      {list.ofAgent && (
        <nav class={`tabs${list.look === undefined ? "" : ` pg-${list.look.pigment}`}`} role="tablist">
          {TABS.map((each) => (
            <button key={each} type="button" role="tab" aria-selected={props.tab === each} onClick={() => props.setTab(each)}>
              {LABELS[each]}
            </button>
          ))}
        </nav>
      )}
      <div class="body">
        <div class="scroll">
          <Notes notes={list.notes} retry={props.retry} />
          {list.ofAgent && props.tab !== "threads" ? (
            props.tabs[props.tab]
          ) : list.ofAgent ? (
            <>
              <div class="filterbar">
                <div class="seg stepbox" role="group" aria-label={CONTROLS.listShows}>
                  {SHOWS.map((each) => (
                    <button key={each} type="button" aria-pressed={props.filter === each} onClick={() => props.setFilter(each)}>
                      {FILTERS[each]}
                    </button>
                  ))}
                </div>
              </div>
              {yours.length > 0 && <h2 class="label">{LABELS.yours}</h2>}
              {rows(yours)}
              {elsewhere.length > 0 && <h2 class="label">{LABELS.elsewhere}</h2>}
              {rows(elsewhere)}
              {list.empty !== undefined && <p class="hint">{thenStart(list.empty, NEW_THREAD_KEY)}</p>}
            </>
          ) : (
            <>
              <h2 class="label">{LABELS.threads}</h2>
              {rows(list.rows)}
              {list.rows.length === 0 && list.empty !== undefined && <p class="hint">{list.empty}</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
