import { dots } from "../../look/index.ts";
import { FILTERS, type ListFilter, type Row } from "../../view/index.ts";
import { role, type Run } from "./paint.ts";
import { hint, isChosen, label, type Line, noteRuns, rowEnd, rowLines, spread, wide, windowed, wrapped } from "./rows.ts";
import { type Frame, listParts, openedKey, rowKey } from "./screen.ts";
import { emptyAgentList, FILTER_KEY, NEW, NEW_THREAD } from "./words.ts";

export interface ListActions {
  /** Open what a row is. */
  open(row: Row): void;
  /** Show everything on an agent's list, or only what is with the person. */
  filter(filter: ListFilter): void;
}

/**
 * The open list: for an agent, its sigil, its name, how it stands and, while
 * it runs, its model and version, the two views of its list, and everything it
 * takes part in, its threads with the person apart from the rest; for an agent
 * that is not running, only why. For a room, its name and members and its
 * threads. `notes` are the notes shown here. A click on a row opens it.
 */
export function drawList(frame: Frame, width: number, height: number, notes: readonly string[], actions: ListActions): Line[] {
  const { paint, levels, model } = frame;
  const list = levels.list;
  if (list === undefined || model.open.list === undefined) return [];
  const start: Run[] = list.startable ? hint(wide(width) ? NEW_THREAD : NEW) : [];
  const lines: Line[] = [];

  if (list.ofAgent) {
    const sigil = dots(list.look?.sigil ?? []);
    const pigment = list.off ? undefined : list.look?.pigment;
    const facts: Run[][] = [
      [[list.name, { tone: pigment ?? "ink3", bold: true }]],
      [[list.about, list.working ? role("busy") : "ink3"]],
      list.facts === undefined ? [] : [[list.facts, "ink3"]],
    ];
    for (let at = 0; at < 3; at += 1) {
      const art: Run = [sigil[at] ?? "      ", pigment === undefined ? "line2" : `${pigment} mark`];
      lines.push({ text: spread(paint, [[" ", "ink"], art, ["  ", "ink"], ...(facts[at] ?? [])], at === 0 ? start : [], width) });
    }
    lines.push({ text: "" });
    if (!list.off) {
      const offered = (filter: ListFilter): Run => [` ${FILTERS[filter]} `, frame.filter === filter ? { tone: "ink", on: "raise" } : "ink3"];
      const everything = offered("everything");
      lines.push({
        text: paint.runs([[" ", "ink"], everything, offered("yours"), ["  ", "ink"], [FILTER_KEY, "ink2"]]),
        go: (column) => actions.filter(column <= everything[0].length ? "everything" : "yours"),
      });
      lines.push({ text: "" });
    }
  } else {
    lines.push({ text: spread(paint, [[" ", "ink"], [list.label, { tone: "ink", bold: true }]], start, width) });
    const about = [list.tag, list.about].filter((part) => part !== undefined).join(" · ");
    lines.push({ text: spread(paint, [[" ", "ink"], [about, "ink3"]], [], width) });
    lines.push({ text: "" });
  }

  for (const note of notes) lines.push(...wrapped(paint, noteRuns(note), width));
  if (notes.length > 0) lines.push({ text: "" });
  // An agent that is not running has only the note that says so.
  if (list.off) return lines;
  if (list.rows.length === 0) {
    const empty = list.empty === undefined ? undefined : list.ofAgent ? emptyAgentList(list.empty, list.name, list.more) : list.empty;
    if (empty !== undefined) lines.push(...wrapped(paint, empty, width, "ink3"));
    return lines;
  }

  const listed: Line[] = [];
  const part = (name: string, rows: readonly Row[]): void => {
    if (rows.length === 0) return;
    if (listed.length > 0) listed.push({ text: "" });
    listed.push(label(paint, name, width));
    for (const each of rows) listed.push(...rowOf(frame, width, each, () => actions.open(each)));
  };
  for (const [name, rows] of listParts(list)) part(name, rows);
  return [...lines, ...windowed(listed, Math.max(0, height - lines.length), (line) => line.key === frame.chosen.list)];
}

/**
 * A thread, or a session behind no thread: what it is called, bold while
 * something in it is new, with the words that mark it, where it is and when,
 * and against the edge how much is new and a lantern while an agent works there.
 */
function rowOf(frame: Frame, width: number, item: Row, go: () => void): Line[] {
  const marks = { focus: frame.front === "list", chosen: isChosen(frame.chosen.list, item), open: openedKey(frame.model.open.item) === rowKey(item) };
  const name: Run[] = [[item.label, item.unread > 0 ? { tone: "ink", bold: true } : "ink"]];
  for (const tag of item.tags) name.push([" ", "ink"], [` ${tag} `, { tone: "ink3", on: "well" }]);
  return rowLines(frame.paint, width, { name, detail: [[item.detail, "ink3"]], detailAt: "edge", end: rowEnd(frame, item), marks, key: rowKey(item), go });
}
