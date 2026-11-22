import { Markdown, type MarkdownTheme, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { type AgentWork, type InFull, type MessageRow, OUT_OF_DATE_MARK, type Step } from "../../view/index.ts";
import { type Paint, role, type Run, type Style, type Tone, type Wool } from "./paint.ts";
import { hintRuns, spread } from "./rows.ts";
import { inFullHints } from "./words.ts";

/** How a tool call's status is drawn, by how it stands. */
const TONES: Record<"good" | "bad" | "busy" | "idle", Tone> = { good: role("good"), bad: role("bad"), busy: role("busy"), idle: "ink3" };

function markdownTheme(paint: Paint): MarkdownTheme {
  const as =
    (style: Style | Tone) =>
    (text: string): string =>
      paint.text(text, style);
  return {
    heading: as({ tone: "coral", bold: true }),
    link: as(role("link")),
    linkUrl: as("ink3"),
    code: as(role("code")),
    codeBlock: as({ tone: "ink2", on: "well" }),
    codeBlockBorder: as("line2"),
    quote: as({ tone: "ink3", italic: true }),
    quoteBorder: as("line2"),
    hr: as("line2"),
    listBullet: as("coral"),
    bold: as({ bold: true }),
    italic: as({ italic: true }),
    strikethrough: as({ strike: true }),
    underline: as({ underline: true }),
  };
}

/**
 * What agents wrote, as Markdown drawn at a width: each text is made once and
 * kept while it is drawn, and what was not drawn since the last `sweep` is let go.
 */
export class Prose {
  #kept = new Map<string, Markdown>();
  #used = new Set<string>();
  #wool: Wool | undefined;

  lines(paint: Paint, text: string, width: number): string[] {
    if (paint.wool !== this.#wool) {
      this.#kept.clear();
      this.#wool = paint.wool;
    }
    let markdown = this.#kept.get(text);
    if (markdown === undefined) {
      markdown = new Markdown(text, 0, 0, markdownTheme(paint));
      this.#kept.set(text, markdown);
    }
    this.#used.add(text);
    return markdown.render(Math.max(1, width));
  }

  sweep(): void {
    for (const text of this.#kept.keys()) if (!this.#used.has(text)) this.#kept.delete(text);
    this.#used.clear();
  }
}

/** Plain text wrapped to `width`, in a style. */
export const wrap = (paint: Paint, text: string, width: number, style: Style | Tone): string[] =>
  wrapTextWithAnsi(paint.text(text, style), Math.max(1, width));

/** Lines moved `cells` in. */
const indent = (lines: readonly string[], cells: number): string[] => lines.map((line) => `${" ".repeat(cells)}${line}`);

/** Runs as one line, cut to `width` with a mark where they were cut. */
const oneOf = (paint: Paint, runs: readonly Run[], width: number): string => truncateToWidth(paint.runs(runs), Math.max(1, width), "…");

/**
 * A message of the thread as it now stands, after a blank line: who said it
 * and when, marked if it was edited, what they said or that it was deleted, the
 * emoji on it, and what came of it where that is worth saying. An agent's
 * words are Markdown, in its pigment's name; a person's are drawn as typed.
 */
export function messageLines(paint: Paint, prose: Prose, row: MessageRow, width: number): string[] {
  const who: Style = { tone: row.agent && row.look !== undefined ? row.look.pigment : "ink", bold: true };
  const head: Run[] = [[row.who, who], [`  ${row.when}`, "ink3"]];
  if (row.edited !== undefined) head.push([`  ${row.edited}`, "ink3"]);
  const inner = width - 2;
  const said = row.deleted ? wrap(paint, row.text, inner, "ink3") : row.agent ? prose.lines(paint, row.text, inner) : wrap(paint, row.text, inner, "ink");
  const lines = ["", oneOf(paint, head, width), ...indent(row.text === "" && !row.deleted ? [] : said, 2)];
  if (row.reactions !== undefined) lines.push(...indent(wrap(paint, row.reactions, inner, "ink3"), 2));
  for (const note of row.notes) lines.push(...indent(wrap(paint, `· ${note}`, inner, role("caution")), 2));
  return lines;
}

/** What is left out of the start of something, on a line of its own. */
const earlierLine = (paint: Paint, earlier: string | undefined): string[] => (earlier === undefined ? [] : [paint.text(`… ${earlier}`, "ink3")]);

/**
 * One step: what the agent thought, wrote or did, or in a session watched what
 * it was shown or where it was reset. Thinking and a tool call take one line
 * each while brief, and as many as they need in full.
 */
export function stepLines(paint: Paint, prose: Prose, step: Step, width: number, inFull: InFull): string[] {
  switch (step.kind) {
    case "shown": {
      const bar = paint.text("▏ ", "line2");
      const lines = [paint.text(step.label, "ink3"), ...indent(earlierLine(paint, step.earlier), 2)];
      if (step.text !== "") lines.push(...wrap(paint, step.text, width - 2, "ink2").map((line) => `${bar}${line}`));
      for (const image of step.images) lines.push(`${bar}${paint.text(image, "ink3")}`);
      return lines;
    }
    case "marker":
      return [oneOf(paint, [[`-- ${step.text} --`, "ink3"]], width)];
    case "thinking": {
      const style: Style = { tone: "ink3", italic: true };
      const said = `${step.label}: ${step.text}`;
      const lines = earlierLine(paint, step.earlier);
      return [...lines, ...(inFull.thinking ? wrap(paint, said, width, style) : [oneOf(paint, [[said.replace(/\s*\n\s*/g, " "), style]], width)])];
    }
    case "text": {
      const lines = earlierLine(paint, step.earlier);
      if (step.text !== "") lines.push(...prose.lines(paint, step.text, width));
      if (step.note !== undefined) lines.push(paint.text(`(${step.note})`, "ink3"));
      return lines;
    }
    case "tool": {
      // A call shown whole may take many lines, so it goes under the line that says how the call stands.
      const head: Run[] = [[step.status, TONES[step.tone]], ["  ", "ink"], [step.name, { tone: "ink", bold: true }]];
      if (!step.whole && step.call !== "") head.push([` ${step.call}`, "ink3"]);
      const lines = step.whole ? wrap(paint, paint.runs(head), width, "ink") : [oneOf(paint, head, width)];
      if (step.whole && step.call !== "") lines.push(...indent(wrap(paint, step.call, width - 2, "ink2"), 2));
      lines.push(...indent(earlierLine(paint, step.earlier), 2));
      for (const output of step.output) {
        lines.push(...indent(step.whole ? wrap(paint, output, width - 2, "ink3") : [oneOf(paint, [[output, "ink3"]], width - 2)], 2));
      }
      for (const image of step.images) lines.push(...indent([paint.text(image, "ink3")], 2));
      for (const note of step.notes) lines.push(...indent(wrap(paint, `· ${note}`, width - 2, "ink3"), 2));
      return lines;
    }
  }
}

/** What stands apart from the steps around it in a session watched: what it was shown, where it was reset, and what it wrote. */
const apart = (step: Step | undefined): boolean => step !== undefined && (step.kind === "shown" || step.kind === "marker" || step.kind === "text");

/** A session watched, oldest first, with a blank line around what stands apart, so that a turn reads as one run. */
export function sessionLines(paint: Paint, prose: Prose, steps: readonly Step[], width: number, inFull: InFull): string[] {
  const lines: string[] = [];
  steps.forEach((step, index) => {
    if (index === 0 || apart(step) || apart(steps[index - 1])) lines.push("");
    lines.push(...stepLines(paint, prose, step, width, inFull));
  });
  return lines;
}

/**
 * The work going on behind a thread, apart from what was said: a bar down its
 * side, and beside its first line the keys that show it in full. Each agent
 * that works gets its name where it needs one, in a room or beside others, and
 * where several work, only its latest step until tool calls are in full.
 */
export function workLines(paint: Paint, prose: Prose, works: readonly AgentWork[], named: boolean, width: number, inFull: InFull): string[] {
  if (works.length === 0) return [];
  const bar = paint.text("▎ ", role("busy", true));
  const pad = named ? 2 : 0;
  const keys = hintRuns(inFullHints(inFull));
  const lines = [""];
  works.forEach((each, index) => {
    const name: Run[] = named ? [[each.name, { tone: each.look.pigment, bold: true }]] : [];
    if (index === 0) lines.push(`${bar}${spread(paint, name, keys, width - 2)}`);
    else if (named) lines.push(`${bar}${oneOf(paint, name, width - 2)}`);
    const steps = works.length > 1 && !inFull.toolCalls ? each.work.steps.slice(-1) : each.work.steps;
    const body = [
      ...(each.stale ? [paint.text(OUT_OF_DATE_MARK, role("caution"))] : []),
      ...(works.length > 1 && !inFull.toolCalls ? [] : earlierLine(paint, each.work.earlier)),
      ...steps.flatMap((step) => stepLines(paint, prose, step, width - 2 - pad, inFull)),
    ];
    lines.push(...body.map((line) => `${bar}${" ".repeat(pad)}${line}`));
  });
  return lines;
}
