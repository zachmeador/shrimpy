/*
 * The second level: everything one agent takes part in, your threads with it
 * apart from the rest, or the threads of a room or of a channel only read.
 */
import type { ComponentChildren } from "preact";
import type { ListFilter, ListLevel, Row } from "../view/index.ts";
import { FILTERS, homeNotRunning, LABELS, thenStart } from "../view/index.ts";
import { Fleck, Glyph, Lamp, Sigil } from "./marks.tsx";
import { Notes } from "./thread.tsx";
import type { Tab } from "./address.ts";
import { CONTROLS, NEW_THREAD, NEW_THREAD_KEY } from "./words.ts";

function ThreadRow({ row, current, open }: { row: Row; current: boolean; open: () => void }) {
  return (
    <button class={`trow${row.unread > 0 ? " unread" : ""}`} type="button" aria-current={current} onClick={open}>
      <span class="t-title">
        <span>{row.label}</span>
        {row.tags.map((tag) => (
          <span key={tag} class="tag">
            {tag}
          </span>
        ))}
      </span>
      <span class="t-sub">{row.detail}</span>
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
  const pigment = list.look === undefined ? "" : ` pg-${list.look.pigment}`;
  let body: ComponentChildren;
  if (list.ofAgent && props.tab === "home" && list.off) body = <p class="note stepbox">{homeNotRunning(list.name)}</p>;
  else if (list.ofAgent && props.tab !== "threads") body = props.tabs[props.tab];
  else if (list.ofAgent) {
    body = (
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
        {list.empty !== undefined && <p class="hint">{list.startable ? thenStart(list.empty, NEW_THREAD_KEY) : list.empty}</p>}
        {elsewhere.length > 0 && <h2 class="label">{LABELS.elsewhere}</h2>}
        {rows(elsewhere)}
      </>
    );
  } else {
    body = (
      <>
        <h2 class="label">{LABELS.threads}</h2>
        {rows(list.rows)}
      </>
    );
  }
  return (
    <>
      <header class={`head${pigment}`}>
        <button class="ib only-narrow" type="button" aria-label={CONTROLS.backToAgents} onClick={props.back}>
          <Glyph name="back" />
        </button>
        {list.ofAgent ? <Sigil look={list.look} size="s36" off={list.off} /> : <span class="hash big">#</span>}
        <div class="titles">
          <h1>
            {list.name}
            {list.tag !== undefined && <span class="tag">{list.tag}</span>}
          </h1>
          <p class={`sub${list.working ? " busy" : ""}`}>{list.about}</p>
        </div>
        {list.startable && (
          <button class="ib" type="button" title={NEW_THREAD} aria-label={NEW_THREAD} onClick={props.start}>
            <Glyph name="plus" />
          </button>
        )}
      </header>
      {list.facts !== undefined && <p class="facts">{list.facts}</p>}
      {list.ofAgent && (
        <nav class={`tabs${pigment}`} role="tablist">
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
          {body}
        </div>
      </div>
    </>
  );
}
