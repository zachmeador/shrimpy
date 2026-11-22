import { type TuiMouseEvent, type TuiMouseEventResult, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Row } from "../../view/index.ts";
import { cutRuns, type Ground, type Paint, role, type Run, runsWidth, type Tone } from "./paint.ts";
import { type Frame, rowKey } from "./screen.ts";
import type { Hint } from "./words.ts";

/** A key and what it does, as a line shows it beside what it acts on. */
export const hint = ([key, does]: Hint): Run[] => [
  [key, "ink2"],
  [` ${does}`, "ink3"],
];

/** Hints on one line, a dot between each. */
export const hintRuns = (hints: readonly Hint[]): Run[] =>
  hints.flatMap((each, index) => [...(index > 0 ? ([[" · ", "ink3"]] as Run[]) : []), ...hint(each)]);

/** The lantern of a working agent: its light, which dims between two pulses. */
export const lamp = (tick: number): Tone => (Math.floor(tick / 3) % 3 === 2 ? "ember" : role("busy", true));

/** A line of a pane, not laid on its ground yet: the ground it is laid on when not the pane's, what a click on it does, and the key of the row it is part of. */
export interface Line {
  text: string;
  on?: Ground;
  /** What a click on the line does, told the column it is in. */
  go?: (column: number) => void;
  key?: string;
}

/**
 * A pane drawn a line at a time from the frame: what it shows comes from
 * `draw`, every line is laid on a ground and is as wide as the pane, and the
 * pane fills the height the levels have. A click on a line does what the line
 * says it does, and a click anywhere else puts the keys in the pane.
 */
export class Pane {
  #lines: Line[] = [];
  readonly #frame: Frame;
  readonly #draw: (width: number, height: number) => Line[];
  readonly #ground: Ground;
  readonly #clicked: () => void;

  constructor(frame: Frame, ground: Ground, draw: (width: number, height: number) => Line[], clicked: () => void) {
    this.#frame = frame;
    this.#ground = ground;
    this.#draw = draw;
    this.#clicked = clicked;
  }

  render(width: number): string[] {
    const height = this.#frame.height();
    const lines = this.#draw(width, height).slice(0, height);
    while (lines.length < height) lines.push({ text: "" });
    this.#lines = lines;
    return lines.map((line) => this.#frame.paint.lay(line.text, width, line.on ?? this.#ground));
  }

  // A press is left to the terminal's selection, which hands back a click when the pointer did not move.
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left") return undefined;
    const go = this.#lines[event.y]?.go;
    if (go === undefined) this.#clicked();
    else go(event.x);
    return { handled: true };
  }

  invalidate(): void {}
}

/**
 * A line `width` cells wide: `left` from the edge, cut to fit, and `right`
 * against the other edge, a cell in from it. It is not laid on a ground.
 */
export function spread(paint: Paint, left: readonly Run[], right: readonly Run[], width: number): string {
  const rightWidth = runsWidth(right);
  const fits = rightWidth > 0 && rightWidth + 2 <= width;
  const head = paint.runs(cutRuns(left, Math.max(0, width - (fits ? rightWidth + 2 : 1))));
  if (!fits) return head;
  return `${head}${" ".repeat(Math.max(1, width - 1 - rightWidth - visibleWidth(head)))}${paint.runs(right)}`;
}

/** A line under a part of a list: its label, and a dotted rule to the pane's edge. */
export function label(paint: Paint, text: string, width: number): Line {
  const rule = Math.max(0, width - 3 - visibleWidth(text));
  return { text: ` ${paint.text(text, "ink3")} ${paint.text("┈".repeat(rule), "line2")}` };
}

/** Text wrapped to the pane, a cell in from each edge, in a tone or in runs already painted. */
export function wrapped(paint: Paint, text: string | readonly Run[], width: number, tone: Tone = "ink"): Line[] {
  const painted = typeof text === "string" ? paint.text(text, tone) : paint.runs(text);
  return wrapTextWithAnsi(painted, Math.max(1, width - 2)).map((line) => ({ text: ` ${line}` }));
}

/** What marks a row: the bar where the keys are, and the ground of what is open. */
export interface Marks {
  /** The keys are in this pane. */
  focus: boolean;
  /** The row is the one chosen. */
  chosen: boolean;
  /** The row is what is open in the level after this one. */
  open: boolean;
}

/**
 * A row of a list: what it is called, how it stands, what it has against the
 * edge, how it is marked, its key, and what a click on it does. Its detail is
 * in a column of its own, as on the agents and rooms, or against the edge, as
 * on a list of threads.
 */
export interface RowParts {
  name: readonly Run[];
  detail: readonly Run[];
  detailAt: "column" | "edge";
  end: readonly Run[];
  marks: Marks;
  key: string;
  go: () => void;
}

/** How wide a pane has to be for a row and its detail to share a line. */
const ONE_LINE = 64;

/** Whether a pane `width` cells wide gives a row and its detail one line. */
export const wide = (width: number): boolean => width >= ONE_LINE;

/**
 * A row of a list, on one line where the pane is wide and on two where it is
 * narrow. A chosen row is raised where the keys are, and an open one where
 * they are not; the bar marks the chosen row, and the open one in the list the
 * keys are in.
 */
export function rowLines(paint: Paint, width: number, parts: RowParts): Line[] {
  const { marks, key, go } = parts;
  const on: Ground | undefined = (marks.focus ? marks.chosen : marks.open) ? "raise" : undefined;
  const bar: Run = marks.focus && marks.chosen ? ["▎", role("fresh", true)] : marks.focus && marks.open ? ["▎", "line2"] : [" ", "ink"];
  const start: Run[] = [bar, [" ", "ink"]];
  if (wide(width) && parts.detailAt === "edge") {
    return [{ text: spread(paint, [...start, ...parts.name], [...parts.detail, ["  ", "ink"], ...parts.end], width), on, go, key }];
  }
  if (wide(width)) {
    // The detail starts at the same column on every row, as in a table.
    const left: Run[] = [...start, ...parts.name, [" ".repeat(Math.max(1, 18 - runsWidth(parts.name))), "ink"], ...parts.detail];
    return [{ text: spread(paint, left, parts.end, width), on, go, key }];
  }
  return [
    { text: spread(paint, [...start, ...parts.name], parts.end, width), on, go, key },
    { text: spread(paint, [...start, ...parts.detail], [], width), on, go, key },
  ];
}

/** How much is new to the person, and a lantern while someone works: what a row has against its edge. */
export function rowEnd(frame: Frame, item: Pick<Row, "unread" | "working">): Run[] {
  const end: Run[] = [];
  if (item.unread > 0) end.push([`${String(item.unread)} ▪ `, role("fresh")]);
  end.push(item.working ? ["▪", lamp(frame.tick)] : [" ", "ink"]);
  return end;
}

/** Whether `item` is the row chosen in a list, by its key. */
export const isChosen = (chosen: string | undefined, item: Pick<Row, "kind" | "id">): boolean => chosen === rowKey(item);

/**
 * The lines of a list, cut to `height` so that the row with `keep` among its
 * lines stays on show: the lines from the top, or the last of them up to it.
 */
export function windowed(lines: Line[], height: number, keep: (line: Line) => boolean): Line[] {
  if (lines.length <= height) return lines;
  const last = lines.findLastIndex(keep);
  const start = last < height ? 0 : last - height + 1;
  return lines.slice(start, start + height);
}
