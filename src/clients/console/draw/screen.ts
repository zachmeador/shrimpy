import { agentEntries, type Item, type Model, type Open, type Place, placeKey, sidesOf } from "../../state/index.ts";
import {
  type AgentsLevel,
  agentsLevel,
  type InFull,
  LABELS,
  type ListFilter,
  type ListLevel,
  listLevel,
  nothingOpen,
  type NothingOpen,
  type Row,
  sessionLevel,
  type SessionLevel,
  threadLevel,
  type ThreadLevel,
} from "../../view/index.ts";
import type { Paint } from "./paint.ts";
import { NEW_THREAD_KEY, SELF } from "./words.ts";

/** How wide a terminal has to be for two levels side by side, and for three. */
export const TWO = 96;
export const THREE = 128;
/** How wide the agents and rooms are beside the other levels, and the open list. */
export const RAIL = 26;
export const LIST = 34;
/** The most cells a line of a thread takes, so that on a wide terminal it stays short enough to read. */
export const MEASURE = 96;

/** A level: the agents and rooms, the open list, or what is open in it. */
export type Level = "agents" | "list" | "item";

/** How many levels stand side by side at `width`: one at a time under 96 columns or when the person folds them, two from 96, three from 128. */
export const levelsAt = (width: number, folded: boolean): 1 | 2 | 3 => (folded || width < TWO ? 1 : width < THREE ? 2 : 3);

/** The levels on show at `width`, left to right, when the keys are in `front`. */
export function onShow(width: number, folded: boolean, front: Level): Level[] {
  switch (levelsAt(width, folded)) {
    case 1:
      return [front];
    case 2:
      return [front === "agents" ? "agents" : "list", "item"];
    case 3:
      return ["agents", "list", "item"];
  }
}

/**
 * The notes the pane of `level` shows: what its level says is not working,
 * but for what a pane to its left already says.
 */
export function notesFor(frame: Frame, level: Level): string[] {
  const { levels, model } = frame;
  const of = (each: Level): string[] => {
    if (each === "agents") return levels.agents.notes;
    if (each === "list") return levels.list?.notes ?? [];
    return (model.open.item?.kind === "session" ? levels.session?.notes : levels.thread?.notes) ?? [];
  };
  const said = new Set<string>();
  for (const each of onShow(frame.width(), frame.folded, frame.front)) {
    const notes = of(each).filter((note) => !said.has(note));
    if (each === level) return notes;
    for (const note of notes) said.add(note);
  }
  return [];
}

/** Every level as the views have it now. */
export interface Levels {
  agents: AgentsLevel;
  list: ListLevel | undefined;
  thread: ThreadLevel | undefined;
  /** The session on show: an agent's view of the open thread, or a session behind no thread. */
  session: SessionLevel | undefined;
  /** What stands where a thread would be while none is open. */
  nothing: NothingOpen | undefined;
}

export interface LevelsOptions {
  /** The moment it is, in milliseconds since the epoch. */
  now: number;
  inFull: InFull;
  filter: ListFilter;
}

export function levelsOf(model: Model, options: LevelsOptions): Levels {
  const at = { now: options.now, self: SELF };
  return {
    agents: agentsLevel(model, at),
    list: listLevel(model, { ...at, filter: options.filter }),
    thread: threadLevel(model, { ...at, inFull: options.inFull }),
    session: sessionLevel(model, { ...at, inFull: options.inFull }),
    nothing: nothingOpen(model, NEW_THREAD_KEY),
  };
}

/** The parts of a list as it is drawn, each under its label: on an agent's list, the person's threads with it apart from the rest. */
export function listParts(list: ListLevel): [label: string, rows: Row[]][] {
  if (!list.ofAgent) return [[LABELS.threads, list.rows]];
  return [
    [LABELS.yours, list.rows.filter((each) => each.yours)],
    [LABELS.elsewhere, list.rows.filter((each) => !each.yours)],
  ];
}

/** The rows of a list in the order they are drawn: its parts, then the row of its archived threads, and theirs while `archived` has them open. */
export function listRows(list: ListLevel, archived: boolean): Row[] {
  const away = list.archived === undefined ? [] : [list.archived.row, ...(archived ? list.archived.rows : [])];
  return [...listParts(list).flatMap(([, rows]) => rows), ...away];
}

/**
 * What a row is told apart by: an ID is only unique among rows of its kind. A
 * row of the agents and rooms has the key the state gives the place it opens.
 */
export const rowKey = (row: Pick<Row, "kind" | "id">): string => `${row.kind} ${row.id}`;

/** The row of the agents and rooms that opens `place`, as the views have it: its name, how it stands and how it looks. */
export const placeRow = (frame: Pick<Frame, "levels">, place: Place): Row | undefined =>
  frame.levels.agents.rows.find((each) => rowKey(each) === placeKey(place));

/** The key of the row of the open list that `item` was opened from, if it has one: a thread not started yet has none. */
export function openedKey(item: Item | undefined): string | undefined {
  if (item?.kind === "session") return rowKey({ kind: "session", id: item.session });
  return item?.thread === undefined ? undefined : rowKey({ kind: "thread", id: item.thread });
}

/**
 * What every part of the screen draws from when it is drawn: the paint, the
 * levels, what is open and chosen, and where the keys are. It changes with the
 * state and the keys, and each part reads it as it is drawn.
 */
export interface Frame {
  paint: Paint;
  /** A count that goes up while something moves: the shrimp, the lanterns and the tide. */
  tick: number;
  /** How many rows the levels have: the terminal's, but for the line of keys. */
  height(): number;
  /** How many columns the terminal has. */
  width(): number;
  folded: boolean;
  front: Level;
  model: Model;
  levels: Levels;
  filter: ListFilter;
  /** The archived threads of the open list are open in place at its foot. */
  archived: boolean;
  inFull: InFull;
  /** The row chosen on the agents and rooms, and on the open list, by `rowKey`. */
  chosen: { agents: string | undefined; list: string | undefined };
  /** The member IDs of the agents that are running. */
  running: ReadonlySet<string>;
  /** The name of this machine, for the line that says who and where the person is. */
  machine: string | undefined;
}

/** The member IDs of the agents that are running, as the gateway lists them. */
export const runningIn = (model: Model): Set<string> => new Set(agentEntries(model).filter((entry) => entry.running).map((entry) => entry.id));

/** Whether the open item is a thread the person can write in, and chat is reached: while it is lost, the input goes, and what was typed waits. */
export const writable = (frame: Pick<Frame, "levels" | "model">): boolean =>
  frame.model.open.item?.kind === "thread" && frame.levels.thread?.writable === true && frame.model.chat.state !== "down";

/** The views of the open thread that Tab goes through after its conversation, and which of them is on show: 0 for the conversation. */
export function sides(model: Model): { count: number; at: number } {
  const all = sidesOf(model);
  const { item } = model.open;
  const side = item?.kind === "thread" ? item.side : undefined;
  return { count: all.length, at: side === undefined ? 0 : all.indexOf(side) + 1 };
}

/** What the keys that depend on where they are do there. The line of keys is made from it. */
export interface Can {
  /** Left and Esc go back a level. */
  back: boolean;
  /** There is an input, and Enter sends what is typed in it. */
  send: boolean;
  /** Up, Down and Right choose and open rows. */
  choose: boolean;
}

/** The level in front, the one the keys are in, as a test that waits for one reads it, with how many levels stand side by side. */
export type Screen = (
  | ({ kind: "agents" } & AgentsLevel)
  | ({ kind: "threads" } & ListLevel)
  | ({ kind: "thread" } & ThreadLevel)
  | ({ kind: "session" } & SessionLevel)
) & { levels: 1 | 2 | 3; can: Can };

/** The level in front as a screen: what it shows and what its keys do there. */
export function screenOf(frame: Frame): Screen {
  const { levels, front, model } = frame;
  const count = levelsAt(frame.width(), frame.folded);
  const can: Can = { back: front !== "agents", send: false, choose: front !== "item" };
  if (front === "item" && levels.session !== undefined && model.open.item?.kind === "session") {
    return { kind: "session", ...levels.session, levels: count, can };
  }
  if (front === "item" && levels.thread !== undefined) {
    return { kind: "thread", ...levels.thread, levels: count, can: { ...can, send: writable(frame) } };
  }
  if (front === "list" && levels.list !== undefined) {
    return { kind: "threads", ...levels.list, levels: count, can: { ...can, choose: listRows(levels.list, frame.archived).length > 0 } };
  }
  return { kind: "agents", ...levels.agents, levels: count, can: { ...can, back: false, choose: levels.agents.rows.length > 0 } };
}

/** The open item, as a key for what was typed in it: a thread the person can write in, by its place and ID, or "new" for one not started. */
export function draftKeyOf(open: Open): string | undefined {
  const { item } = open;
  return item?.kind === "thread" && item.place.kind !== "read-only" ? `${JSON.stringify(item.place)}\n${item.thread ?? "new"}` : undefined;
}
