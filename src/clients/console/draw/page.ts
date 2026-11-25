import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { halves } from "../../look/index.ts";
import { EMPTY, type Fact, type FileLevel, LABELS } from "../../view/index.ts";
import { role, type Run, type Style, type Tone } from "./paint.ts";
import { hint, lamp, type Line, marking, spread } from "./rows.ts";
import type { Frame } from "./screen.ts";
import { NEW_THREAD } from "./words.ts";

/** A line of the page: a line of a pane, with the bar that marks a chosen row of the home, which stands in the margin before it. */
export interface PageLine extends Line {
  bar?: Run;
}

/** How wide the page has to be for the agent's sigil to stand beside its facts. */
const SIGIL_AT = 62;

/** How wide the labels of the facts are, as a column, and the sigil beside them with the gap after it. */
const LABEL = 9;
const ART = 15;

/**
 * The head of an agent's page where a thread's would be: its name in its
 * pigment, and Ctrl+N where a thread can be started; for a file of its home,
 * whose home and where in it, then how big it is. A rule under either.
 */
export function pageHead(frame: Frame, width: number): string[] {
  const { paint, levels } = frame;
  const { page, file, list } = levels;
  if (page === undefined) return [];
  const name: Run = [page.name, page.off ? { tone: "ink3", bold: true } : { tone: page.look.pigment, bold: true }];
  const lines: string[] = [];
  if (file !== undefined) {
    lines.push(spread(paint, [[" ", "ink"], name, [" · ", "ink3"], [file.path, "ink"]], [], width));
    lines.push(spread(paint, [[" ", "ink"], [file.size ?? "", "ink3"]], [], width));
  } else {
    lines.push(spread(paint, [[" ", "ink"], name], list?.startable === true ? hint(NEW_THREAD) : [], width));
  }
  lines.push(paint.text("─".repeat(width), "line"));
  return lines;
}

/** A line under a part of the page: its label, and a dotted rule to `width`. */
const rule = (frame: Frame, text: string, width: number): Line => ({
  text: frame.paint.runs([[text, "ink3"], [` ${"┈".repeat(Math.max(0, width - visibleWidth(text) - 1))}`, "line2"]]),
});

/** Runs wrapped to `width`, each line painted. */
const wrapRuns = (frame: Frame, runs: readonly Run[], width: number): string[] => wrapTextWithAnsi(frame.paint.runs(runs), Math.max(1, width));

/**
 * An agent's page as lines, `width` cells wide at most, from its top: its
 * sigil pressed into the pane beside how it stands, where the page is wide
 * enough; then why its triggers and home can't be read, or its triggers, each
 * its file, and its home as a tree, whose chosen row is marked as a list's is.
 * A click on a row of the tree does what → does on it.
 */
export function pageLines(frame: Frame, width: number, open: (path: string) => void): PageLine[] {
  const { paint, levels } = frame;
  const page = levels.page;
  if (page === undefined) return [];
  const art = width >= SIGIL_AT ? halves(page.look.sigil) : [];
  const facts = page.facts.flatMap((fact) => factRuns(frame, fact, width - LABEL - (art.length === 0 ? 0 : ART)));
  const lines: PageLine[] = [{ text: "" }];
  for (let at = 0; at < Math.max(art.length, facts.length); at += 1) {
    const sigil: Run[] = art.length === 0 ? [] : [[(art[at] ?? "").padEnd(ART - 3), "press"], ["   ", "ink"]];
    lines.push({ text: paint.runs([...sigil, ...(facts[at] ?? [])]) });
  }
  lines.push({ text: "" });
  if (page.note !== undefined) {
    for (const line of wrapRuns(frame, [[page.note, role("caution")]], width)) lines.push({ text: line });
    return lines;
  }

  lines.push(rule(frame, LABELS.triggers, width));
  if (page.triggers?.length === 0) lines.push({ text: paint.text(page.noTriggers, "ink3") }, { text: "" });
  for (const card of page.triggers ?? []) {
    lines.push({ text: spread(paint, [[card.path, { tone: "ink", bold: true }]], [[card.when, "ink3"]], width + 1) });
    const bar: Run = ["▏ ", "line2"];
    const { file } = card;
    if (file !== undefined && "note" in file) {
      for (const line of wrapRuns(frame, [[file.note, role("caution")]], width - 2)) lines.push({ text: `${paint.runs([bar])}${line}` });
    } else if (file !== undefined) {
      for (const line of file.front ?? []) lines.push({ text: paint.runs([bar, [line, "ink3"]]) });
      if (file.body !== "") for (const line of wrapRuns(frame, [[file.body, "ink2"]], width - 2)) lines.push({ text: `${paint.runs([bar])}${line}` });
    }
    lines.push({ text: "" });
  }

  lines.push(rule(frame, LABELS.home, width));
  const focus = frame.front === "item";
  for (const row of page.home) {
    const indent = "  ".repeat(row.depth);
    if (row.kind === "empty") {
      lines.push({ text: paint.text(`${indent}  ${EMPTY}`, "ink3") });
      continue;
    }
    if (row.kind === "note") {
      for (const line of wrapRuns(frame, [[row.name, role("caution")]], width - indent.length)) lines.push({ text: `${indent}${line}` });
      continue;
    }
    const marks = { focus, chosen: frame.home.chosen === row.path, open: frame.home.file === row.path };
    const { on, start } = marking(marks);
    const mark: Run = row.kind === "folder" ? [row.open ? "▾ " : "▸ ", "ink3"] : ["  ", "ink"];
    const style: Style | Tone = row.kind === "folder" ? { tone: "ink", bold: true } : row.kind === "file" ? "ink2" : "ink3";
    const name = row.kind === "folder" ? `${row.name}/` : row.name;
    // The bar of a chosen row stands in the margin before the page, as a list's does.
    lines.push({ text: paint.runs([[indent, "ink"], mark, [name, style]]), on, bar: start[0], go: () => open(row.path), key: row.path });
  }
  return lines;
}

/**
 * A fact as lines of runs: its label in a column, then what it is, and the
 * line under it, if it has one, under what it is, each wrapped to `room`.
 */
function factRuns(frame: Frame, fact: Fact, room: number): Run[][] {
  const wrap = (text: string): string[] => wrapTextWithAnsi(text, Math.max(1, room));
  const [first = "", ...more] = wrap(fact.value);
  const value: Run[] = fact.working ? [[first, role("busy")], ["  ", "ink"], ["▪", lamp(frame.tick)]] : [[first, "ink"]];
  const pad: Run = [" ".repeat(LABEL), "ink"];
  return [
    [[fact.label.padEnd(LABEL), "ink3"], ...value],
    ...more.map((line): Run[] => [pad, [line, fact.working ? role("busy") : "ink"]]),
    ...(fact.sub === undefined ? [] : wrap(fact.sub).map((line): Run[] => [pad, [line, "ink3"]])),
  ];
}

/** A file of the agent's home, opened where its page was: its text, or a line for a picture, which the terminal doesn't draw, or why it could not be read. */
export function fileLines(frame: Frame, file: FileLevel, width: number): Line[] {
  const { paint } = frame;
  const { shown } = file;
  const lines: Line[] = [{ text: "" }];
  if (shown === undefined) return lines;
  if (shown.kind === "text") for (const line of shown.text.split("\n")) for (const each of wrapRuns(frame, [[line, "ink2"]], width)) lines.push({ text: each });
  else if (shown.kind === "empty") lines.push({ text: paint.text(EMPTY, "ink3") });
  else if (shown.kind === "image") lines.push({ text: paint.runs([["▣ ", "ink3"], [file.path.split("/").at(-1) ?? file.path, "ink"], [`  ${file.size ?? ""}`, "ink3"]]) });
  else for (const line of wrapRuns(frame, [[shown.note, role("caution")]], width)) lines.push({ text: line });
  return lines;
}
