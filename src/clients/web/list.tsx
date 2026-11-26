/*
 * The second level: an agent's list, the threads of your DM with it or
 * everything else it takes part in, as its tabs say, or the threads of a room
 * or of a channel only read.
 */
import type { ComponentChildren } from "preact";
import type { AgentTab, ListLevel, Row } from "../view/index.ts";
import { AGENT_TABS, LABELS, thenStart } from "../view/index.ts";
import { Fleck, Glyph, Lamp, Sigil } from "./marks.tsx";
import { Notes } from "./thread.tsx";
import { CONTROLS, NEW_THREAD, NEW_THREAD_KEY, pageOf } from "./words.ts";

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
      {row.detail !== "" && <span class="t-sub">{row.detail}</span>}
      <span class="t-end">
        {row.unread > 0 && <span class="count">{row.unread}</span>}
        {row.unread > 0 && <Fleck />}
        {row.working && <Lamp />}
      </span>
    </button>
  );
}

/** The archived threads of a list: the row at its foot that opens them in place, lit while an agent works in one, and theirs while it is open. */
function Archived({ archived, open, toggle, rows }: { archived: ListLevel["archived"]; open: boolean; toggle: () => void; rows: (each: Row[]) => ComponentChildren }) {
  if (archived === undefined) return null;
  return (
    <>
      <button class="label fold" type="button" aria-expanded={open} onClick={toggle}>
        <span>{archived.row.label}</span>
        {archived.row.working && <Lamp />}
        <Glyph name="fold" />
      </button>
      {open && rows(archived.rows)}
    </>
  );
}

interface ListProps {
  list: ListLevel;
  /** An agent's tab on show. */
  tab: AgentTab;
  /** The archived threads are open in place at the foot of the list. */
  archivedOpen: boolean;
  /** The row that is open, by what opens it. */
  current: string | undefined;
  retry: string | undefined;
  back: () => void;
  start: () => void;
  open: (row: Row) => void;
  /** Open the agent's page, from its name or sigil. */
  page: () => void;
  setTab: (tab: AgentTab) => void;
  toggleArchived: () => void;
}

export function ListView(props: ListProps) {
  const { list } = props;
  const rows = (each: Row[]) =>
    each.map((row) => <ThreadRow key={row.id} row={row} current={row.id === props.current} open={() => props.open(row)} />);
  const pigment = list.look === undefined ? "" : ` pg-${list.look.pigment}`;
  const titles = (
    <div class="titles">
      <h1>
        {list.name}
        {list.tag !== undefined && <span class="tag">{list.tag}</span>}
      </h1>
      <p class={`sub${list.working ? " busy" : ""}`}>{list.about}</p>
    </div>
  );
  const empty = list.empty === undefined ? undefined : list.ofAgent && list.startable && props.tab === "chat" ? thenStart(list.empty, NEW_THREAD_KEY) : list.empty;
  return (
    <>
      <div class="list-top">
        <header class={`head${pigment}`}>
          <button class="ib only-narrow" type="button" aria-label={CONTROLS.backToAgents} onClick={props.back}>
            <Glyph name="back" />
          </button>
          {list.ofAgent ? (
            // The agent's name and sigil open its page, which is how a phone gets to it.
            <button class="whois" type="button" title={pageOf(list.name)} aria-label={pageOf(list.name)} onClick={props.page}>
              <Sigil look={list.look} size="s36" off={list.off} />
              {titles}
            </button>
          ) : (
            <>
              <span class="hash big">#</span>
              {titles}
            </>
          )}
          {list.startable && (
            <button class="ib" type="button" title={NEW_THREAD} aria-label={NEW_THREAD} onClick={props.start}>
              <Glyph name="plus" />
            </button>
          )}
        </header>
        {list.ofAgent && (
          <nav class={`tabs${pigment}`} role="tablist">
            {AGENT_TABS.map((each) => (
              <button key={each} type="button" role="tab" aria-selected={props.tab === each} onClick={() => props.setTab(each)}>
                {each}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div class="body">
        <div class="scroll">
          <Notes notes={list.notes} retry={props.retry} />
          {!list.ofAgent && <h2 class="label">{LABELS.threads}</h2>}
          {rows(list.rows)}
          {empty !== undefined && <p class="hint">{empty}</p>}
          <Archived archived={list.archived} open={props.archivedOpen} toggle={props.toggleArchived} rows={rows} />
        </div>
      </div>
    </>
  );
}
