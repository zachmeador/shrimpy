import { dots } from "../../look/index.ts";
import { type AgentTab, thenStart, type Row } from "../../view/index.ts";
import { role, type Run, runsWidth } from "./paint.ts";
import { hint, isChosen, label, lamp, type Line, marking, noteRuns, rowEnd, rowLines, spread, wide, windowed, wrapped } from "./rows.ts";
import { type Frame, listLabel, onShow, openedKey, pageRow, pageShown, rowKey } from "./screen.ts";
import { NEW, NEW_THREAD, NEW_THREAD_KEY, TABS_KEY } from "./words.ts";

export interface ListActions {
  /** Open what a row is. */
  open(row: Row): void;
  /** Show the other tab of an agent's list. */
  tab(tab: AgentTab): void;
}

/**
 * The open list: for an agent, its sigil, its name and how it stands, which
 * open its page, its two tabs, and the threads of the tab on show. For a room,
 * its name and members and its threads. `notes` are the notes shown here. A
 * click on a row opens it.
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
    const said: Run[][] = [[[list.name, { tone: pigment ?? "ink3", bold: true }]], [[list.about, list.working ? role("busy") : "ink3"]], []];
    // The name and the sigil are a row of the list, the first, which opens the agent's page.
    const row = pageRow(list);
    const open = pageShown(model) && onShow(frame.width(), frame.folded, frame.front).includes("item");
    const { on, start: [bar = [" ", "ink"]] } = marking({ focus: frame.front === "list", chosen: isChosen(frame.chosen.list, row), open });
    for (let at = 0; at < 3; at += 1) {
      const art: Run = [sigil[at] ?? "      ", pigment === undefined ? "line2" : `${pigment} mark`];
      const text = spread(paint, [bar, art, ["  ", "ink"], ...(said[at] ?? [])], at === 0 ? start : [], width);
      lines.push({ text, on, go: () => actions.open(row), key: rowKey(row) });
    }
    lines.push({ text: "" });
    const offered = (tab: AgentTab): Run => [` ${tab} `, frame.tab === tab ? { tone: "ink", on: "raise" } : "ink3"];
    const chat = offered("chat");
    lines.push({
      text: paint.runs([[" ", "ink"], chat, offered("observe"), ["  ", "ink"], [TABS_KEY, "ink2"]]),
      go: (column) => actions.tab(column <= chat[0].length ? "chat" : "observe"),
    });
    lines.push({ text: "" });
  } else {
    lines.push({ text: spread(paint, [[" ", "ink"], [list.label, { tone: "ink", bold: true }]], start, width) });
    const about = [list.tag, list.about].filter((part) => part !== undefined).join(" · ");
    lines.push({ text: spread(paint, [[" ", "ink"], [about, "ink3"]], [], width) });
    lines.push({ text: "" });
  }

  for (const note of notes) lines.push(...wrapped(paint, noteRuns(note), width));
  if (notes.length > 0) lines.push({ text: "" });
  if (list.rows.length === 0) {
    const empty = list.empty === undefined ? undefined : list.ofAgent && list.startable && frame.tab === "chat" ? thenStart(list.empty, NEW_THREAD_KEY) : list.empty;
    if (empty !== undefined) lines.push(...wrapped(paint, empty, width, "ink3"));
    if (list.archived === undefined) return lines;
  }

  const listed: Line[] = [];
  const named = listLabel(list);
  if (named !== undefined && list.rows.length > 0) listed.push(label(paint, named, width));
  for (const each of list.rows) listed.push(...rowOf(frame, width, each, () => actions.open(each)));
  const { archived } = list;
  if (archived !== undefined) {
    listed.push({ text: "" }, archivedLine(frame, width, archived.row, () => actions.open(archived.row)));
    if (frame.archived) for (const each of archived.rows) listed.push(...rowOf(frame, width, each, () => actions.open(each)));
  }
  return [...lines, ...windowed(listed, Math.max(0, height - lines.length), (line) => line.key === frame.chosen.list)];
}

/** The row at the foot of a list that opens its archived threads in place, and shuts them: how many, a dotted rule to the edge, and a lantern while an agent works in one. */
function archivedLine(frame: Frame, width: number, row: Row, go: () => void): Line {
  const marks = { focus: frame.front === "list", chosen: isChosen(frame.chosen.list, row), open: false };
  const { on, start } = marking(marks);
  const said: Run[] = [...start, [row.label, marks.focus && marks.chosen ? "ink2" : "ink3"], [" ", "ink"]];
  const rule = Math.max(0, width - runsWidth(said) - (row.working ? 3 : 2));
  const end: Run[] = row.working ? [["▪", lamp(frame.tick)]] : [];
  return { text: spread(frame.paint, [...said, ["┈".repeat(rule), "line2"]], end, width), on, go, key: rowKey(row) };
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
