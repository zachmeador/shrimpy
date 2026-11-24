import { oneLine } from "../../../lib/plain/index.ts";
import { dots, WORDMARK } from "../../look/index.ts";
import { placeKey } from "../../state/index.ts";
import { LABELS, OUT_OF_DATE, type Row, versionLine } from "../../view/index.ts";
import { role, type Run, type Tone } from "./paint.ts";
import { isChosen, label, lamp, type Line, noteRuns, rowEnd, rowLines, spread, windowed, wrapped } from "./rows.ts";
import { type Frame, rowKey } from "./screen.ts";
import { updateOffer } from "./words.ts";

/** The wordmark in braille, with a row of dots above it: sixteen cells by three. */
const MARK = dots(["", ...WORDMARK]);

/**
 * The agents and rooms: the wordmark, Shrimpy's version and the release's
 * name, the tide with a lantern for each agent, lit while it works, what is not
 * working, every agent with how it stands and how much is new by it, the rooms
 * and the rooms only read, and at the foot who and where the person is.
 * `notes` are the notes shown here. A click on a row opens it.
 */
export function drawRail(frame: Frame, width: number, height: number, notes: readonly string[], open: (row: Row) => void): Line[] {
  const { paint, levels, model } = frame;
  const { agents } = levels;
  const top: Line[] = [{ text: "" }, ...MARK.map((line) => ({ text: ` ${paint.text(line, "ink")}` }))];
  const [lead, release] = versionLine();
  top.push({ text: ` ${paint.runs([[lead, "ink3"], [release, { tone: "ink2", italic: true }]])}` });
  const agentRows = agents.rows.filter((each) => each.kind === "agent");
  top.push({ text: tide(frame, width, agentRows) }, { text: "" });
  for (const note of notes) top.push(...wrapped(paint, noteRuns(note), width));
  if (agents.update !== undefined) {
    const [before, key, after] = updateOffer(agents.update);
    top.push(...wrapped(paint, [[before, "ink2"], [key, { tone: "ink", bold: true }], [after, "ink2"]], width));
  }
  if (agents.empty !== undefined) top.push(...wrapped(paint, agents.empty, width, "ink3"));
  if (notes.length > 0 || agents.empty !== undefined || agents.update !== undefined) top.push({ text: "" });

  const focus = frame.front === "agents";
  const openKey = model.open.list === undefined ? undefined : placeKey(model.open.list);
  const rowOf = (item: Row): Line[] => {
    const running = item.kind !== "agent" || frame.running.has(item.id);
    const name: Run =
      item.kind === "agent"
        ? [item.label, running && item.look !== undefined ? { tone: item.look.pigment, bold: true } : "ink3"]
        : [item.label, { tone: "ink", bold: true }];
    const marks = { focus, chosen: isChosen(frame.chosen.agents, item), open: openKey === rowKey(item) };
    const detail: Run = [item.detail, item.working ? role("busy") : "ink3"];
    return rowLines(paint, width, { name: [name], detail: [detail], detailAt: "column", end: rowEnd(frame, item), marks, key: rowKey(item), go: () => open(item) });
  };
  const listed: Line[] = [];
  if (agentRows.length > 0) {
    listed.push(label(paint, LABELS.agents, width));
    for (const item of agentRows) listed.push(...rowOf(item));
  }
  const rooms = agents.rows.filter((each) => each.kind !== "agent");
  if (rooms.length > 0) {
    if (listed.length > 0) listed.push({ text: "" });
    listed.push(label(paint, LABELS.rooms, width));
    for (const item of rooms) listed.push(...rowOf(item));
  }

  const me = model.me === undefined ? undefined : oneLine(model.me.name);
  const foot: Run[] = me === undefined ? [] : [["○ ", "ink3"], [me, "ink2"]];
  if (me !== undefined && frame.machine !== undefined) foot.push([` · ${oneLine(frame.machine)}`, "ink3"]);
  if (agents.stale) foot.push([` · ${OUT_OF_DATE}`, "ink3"]);
  const room = Math.max(0, height - top.length - (foot.length > 0 ? 2 : 0));
  const shown = windowed(listed, room, (line) => line.key === frame.chosen.agents);
  const lines = [...top, ...shown];
  if (foot.length > 0) {
    while (lines.length < height - 1) lines.push({ text: "" });
    lines.push({ text: spread(paint, [[" ", "ink"], ...foot], [], width) });
  }
  return lines;
}

/** The tide: water that moves while something works, and against the edge a lantern for each agent, lit while it works. */
function tide(frame: Frame, width: number, agents: readonly Row[]): string {
  const lanterns = agents.slice(0, Math.max(0, Math.floor((width - 10) / 2)));
  const cells: Run[] = [[" ", "ink"]];
  const flow = Math.floor(frame.tick / 4);
  for (let at = 1; at < width - 2 - lanterns.length * 2; at += 1) {
    const phase = (((at + flow) % 9) + 9) % 9;
    cells.push(phase < 4 ? ["─", phase < 2 ? "tide2" : "tide"] : phase === 5 || phase === 6 ? ["┈", "tide"] : [" ", "ink"]);
  }
  cells.push([" ", "ink"]);
  for (const agent of lanterns) {
    const tone: Tone = agent.working ? lamp(frame.tick) : frame.running.has(agent.id) ? "line2" : "line";
    cells.push(["▪", tone], [" ", "ink"]);
  }
  return frame.paint.runs(cells);
}
