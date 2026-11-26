import { placeLabel, threadName } from "../../contracts/agent/index.ts";
import { ARCHIVED, notTalkedTo, threadTags, titleOf } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentEntries, agentNameOf, type Model, type Part, partsOf, type Place, processesIn, unreadOf, watchesIn } from "../state/index.ts";
import { agentAbout } from "./agents.ts";
import { type LevelOptions, lookingAt, type Row } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
import {
  ADMIN_TAG,
  type AgentTab,
  archivedRow,
  membersLine,
  nothingElse,
  notRunning,
  PICK_LIST,
  PICK_THREAD,
  pickOrStart,
  READ_ONLY_TAG,
  waitingOnLine,
} from "./words.ts";

/**
 * The second level: on an agent's list, the threads of the person's DM with
 * it, or everything else it takes part in, newest first, as the tab on show
 * says; or the threads of the open room or channel.
 */
export interface ListLevel {
  stale: boolean;
  rows: Row[];
  archived: { row: Row; rows: Row[] } | undefined;
  empty: string | undefined;
  label: string;
  name: string;
  tag: string | undefined;
  about: string;
  working: boolean;
  look: Look | undefined;
  ofAgent: boolean;
  off: boolean;
  settled: boolean;
  startable: boolean;
  notes: string[];
}

export interface ListOptions extends LevelOptions {
  /** The tab on show on an agent's list. Chat when this is left out. */
  tab?: AgentTab;
}

/** The open list, as plain text and facts, or none while no list is open. */
export function listLevel(model: Model, options: ListOptions): ListLevel | undefined {
  const { list } = model.open;
  if (list === undefined) return undefined;
  return list.kind === "agent" ? agentList(model, list.id, options.tab ?? "chat", options) : channelList(model, list, options);
}

/** The threads of a room the person is in, or of a room they only read. */
function channelList(model: Model, place: Exclude<Place, { kind: "agent" }>, options: LevelOptions): ListLevel {
  const here = lookingAt(model, place);
  const stale = model.chat.state === "down";
  const reading = place.kind === "read-only";
  const listed = here.threads.map((thread) => {
    const waiting = stale ? [] : [...new Set(watchesIn(model, thread.id).map((each) => each.watch.onAgentName))];
    const busy = thread.working.length > 0 || processesIn(model, thread.id).length > 0;
    return {
      archived: thread.archived,
      row: {
        id: thread.id,
        kind: "thread",
        label: titleOf(thread),
        name: titleOf(thread),
        tags: threadTags({ pinned: thread.pinned, archived: false }),
        detail: [whenOf(thread.updatedAt, options.now), reading ? READ_ONLY_TAG : undefined, waiting.length > 0 ? waitingOnLine(waiting, true) : undefined]
          .filter((part) => part !== undefined)
          .join(" · "),
        working: busy && !stale,
        unread: unreadOf(here.unread, thread),
        yours: false,
        look: undefined,
      } satisfies Row,
    };
  });
  const members = here.channel?.members ?? [];
  return {
    stale,
    ...apart(listed),
    empty: undefined,
    label: here.label,
    name: oneLine(here.name),
    tag: reading ? READ_ONLY_TAG : undefined,
    about: membersLine(members),
    working: false,
    look: undefined,
    ofAgent: false,
    off: false,
    settled: true,
    startable: !reading,
    notes: notesOf(model, { agent: undefined, watching: false, looking: undefined, refused: undefined, notice: false }, options.self),
  };
}

function agentList(model: Model, agentId: string, tab: AgentTab, options: ListOptions): ListLevel {
  const name = agentNameOf(model, agentId);
  const parts = partsOf(model, agentId);
  const said = model.sessions !== undefined;
  const stale = model.chat.state === "down" || (model.agent?.state === "down" && said);
  const shown = parts.filter((part) => part.yours === (tab === "chat"));
  const listed = shown.map((part) => ({
    archived: part.thread?.archived === true,
    row: partRow(part, model.me?.name, options.now, stale, readOnly(model, part)),
  }));
  const refused = model.refusal === undefined ? undefined : { what: "sessions" as const, words: model.refusal };
  const entry = agentEntries(model).find((each) => each.id === agentId);
  const running = entry?.running === true;
  const none = tab === "chat" ? notTalkedTo(name) : running ? nothingElse(name) : notRunning(name);
  return {
    stale,
    ...apart(listed),
    empty: shown.length === 0 && model.chat.state === "up" ? none : undefined,
    label: oneLine(name),
    name: oneLine(name),
    tag: model.listing?.members.some((member) => member.id === agentId && member.admin) === true ? ADMIN_TAG : undefined,
    about: entry === undefined ? "" : agentAbout(entry, model.me?.name),
    working: entry?.working === true && !stale,
    look: lookOf(model, agentId),
    ofAgent: true,
    off: !running,
    settled: said,
    startable: running,
    notes: notesOf(model, { agent: agentId, watching: false, looking: running ? "sessions" : undefined, refused, notice: false }, options.self),
  };
}

/** The tab of an agent's list that holds what is open in it: chat for a thread of the person's DM with the agent, and observe for anything else. */
export function tabHolding(model: Pick<Model, "open">): AgentTab | undefined {
  const { list, item } = model.open;
  if (list?.kind !== "agent" || item === undefined) return undefined;
  return item.place.kind === "agent" ? "chat" : "observe";
}

function apart(listed: readonly { archived: boolean; row: Row }[]): Pick<ListLevel, "rows" | "archived"> {
  const rows = listed.filter((each) => !each.archived).map((each) => each.row);
  const away = listed.filter((each) => each.archived).map((each) => each.row);
  if (away.length === 0) return { rows, archived: undefined };
  const label = archivedRow(away.length);
  const row: Row = { id: ARCHIVED, kind: "archived", label, name: label, tags: [], detail: "", working: away.some((each) => each.working), unread: 0, yours: false, look: undefined };
  return { rows, archived: { row, rows: away } };
}

function readOnly(model: Model, part: Part): boolean {
  if (part.thread !== undefined) return model.readOnly[part.thread.channelId] !== undefined;
  return part.place?.kind === "dm" && part.place.with.kind === "agent";
}

function partRow(part: Part, me: string | undefined, now: number, stale: boolean, reading: boolean): Row {
  const where = part.yours || part.place === null ? undefined : placeLabel(part.place, me);
  const working = part.working && !stale;
  let label = oneLine(part.id);
  let tags: string[] = [];
  if (part.thread !== undefined) {
    label = titleOf(part.thread);
    tags = threadTags({ pinned: part.thread.pinned, archived: false });
  } else if (part.place !== null) {
    label = threadName(part.place, part.id).label;
  }
  const when = part.at === undefined ? undefined : whenOf(part.at, now);
  const waiting = !stale && part.waiting.length > 0 ? waitingOnLine(part.waiting, true) : undefined;
  return {
    id: part.id,
    kind: "thread",
    label,
    name: label,
    tags,
    detail: [where, when, reading ? READ_ONLY_TAG : undefined, waiting].filter((each) => each !== undefined).join(" · "),
    working,
    unread: part.unread,
    yours: part.yours,
    look: undefined,
  };
}

export function nothingOpen(model: Pick<Model, "open">, key: string): string | undefined {
  const { list, item } = model.open;
  if (item !== undefined) return undefined;
  if (list === undefined) return PICK_LIST;
  if (list.kind === "read-only") return PICK_THREAD;
  return list.kind === "room" ? pickOrStart(key) : undefined;
}
