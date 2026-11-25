import { Markdown, type MarkdownTheme, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ToolStatus } from "../../../contracts/agent/index.ts";
import { nameKey } from "../../../contracts/gateway/index.ts";
import {
  type AgentWork,
  type InFull,
  type Look,
  type Mention,
  type MessageRow,
  NEW_SINCE_SHORT,
  OUT_OF_DATE_MARK,
  reactionsLine,
  type Step,
  withMentions,
} from "../../view/index.ts";
import { type Paint, role, type Run, runsWidth, type Style, type Tone, type Wool } from "./paint.ts";
import { hintRuns, spread } from "./rows.ts";
import { inFullHints } from "./words.ts";

/** The mark before how a tool call stands, and its tone, by how it stands. */
const MARKS: Record<ToolStatus, [mark: string, tone: Tone]> = {
  pending: ["○", "ink3"],
  running: ["●", role("busy")],
  done: ["✓", role("good")],
  error: ["✗", role("bad")],
  interrupted: ["!", role("bad")],
};

function markdownTheme(paint: Paint): MarkdownTheme {
  const as =
    (style: Style | Tone) =>
    (text: string): string =>
      paint.text(text, style);
  // Code is shown as it was written, so a mention in it is not marked.
  const asCode =
    (style: Style | Tone) =>
    (text: string): string =>
      paint.text(text.replace(MENTION_ENDS, ""), style);
  return {
    heading: as({ tone: "ink", bold: true }),
    link: as(role("link")),
    linkUrl: as("ink3"),
    code: asCode(role("code")),
    codeBlock: asCode({ tone: "ink2", on: "well" }),
    codeBlockBorder: as("line2"),
    quote: as({ tone: "ink3", italic: true }),
    quoteBorder: as("line2"),
    hr: as("line2"),
    listBullet: as("ink3"),
    bold: as({ bold: true }),
    italic: as({ italic: true }),
    strikethrough: as({ strike: true }),
    underline: as({ underline: true }),
  };
}

/** How a mention of an agent is drawn: in its pigment, bold. */
const mentionStyle = (look: Look): Style => ({ tone: look.pigment, bold: true });

/** Runs of `text`, with each `@name` of an agent in `mentions` in its pigment, and the rest in `style`. */
const mentionRuns = (text: string, mentions: readonly Mention[], style: Style | Tone): Run[] =>
  withMentions(text, mentions).map((part) => (typeof part === "string" ? [part, style] : [part.mention, mentionStyle(part.look)]));

/**
 * What a mention in Markdown is set between until it is drawn: characters
 * that take no cells, which Markdown reads as text, even in a link's address.
 */
const MENTION_OPEN = "\u2060";
const MENTION_CLOSE = "\u2061";
const MENTION_ENDS = /[\u2060\u2061]/g;
const BRACKETED = /\u2060([^\u2061]*)\u2061/g;

/** Markdown with each `@name` of an agent in `mentions` set between the marks. */
const bracketed = (source: string, mentions: readonly Mention[]): string =>
  withMentions(source, mentions)
    .map((part) => (typeof part === "string" ? part : `${MENTION_OPEN}${part.mention}${MENTION_CLOSE}`))
    .join("");

/**
 * Markdown's lines with each mention set between the marks drawn in its
 * agent's pigment. A name with a space in it can be wrapped onto the next line,
 * so the lines are read as one.
 */
function painted(paint: Paint, lines: readonly string[], mentions: readonly Mention[]): string[] {
  const looks = new Map(mentions.map(({ name, look }) => [nameKey(name), look]));
  const joined = lines.join("\n").replace(BRACKETED, (whole, inner: string) => {
    const look = looks.get(nameKey(stripTerminalSequences(inner).replace(/\s*\n\s*/g, " ").slice(1)));
    return look === undefined ? inner : inner.split("\n").map((part) => paint.text(part, mentionStyle(look))).join("\n");
  });
  return joined.replace(MENTION_ENDS, "").split("\n");
}

/**
 * What agents wrote, as Markdown drawn at a width, with each `@name` of an
 * agent it mentions in that agent's pigment: each text is made once and kept
 * while it is drawn, and what was not drawn since the last `sweep` is let go.
 */
export class Prose {
  #kept = new Map<string, Markdown>();
  #used = new Set<string>();
  #wool: Wool | undefined;

  lines(paint: Paint, text: string, width: number, mentions: readonly Mention[] = []): string[] {
    if (paint.wool !== this.#wool) {
      this.#kept.clear();
      this.#wool = paint.wool;
    }
    const key = [text, ...mentions.map(({ name, look }) => `${name} ${look.pigment}`)].join("\u0000");
    let markdown = this.#kept.get(key);
    if (markdown === undefined) {
      markdown = new Markdown(text, 0, 0, markdownTheme(paint), undefined, mentions.length === 0 ? {} : { transform: (source) => bracketed(source, mentions) });
      this.#kept.set(key, markdown);
    }
    this.#used.add(key);
    const lines = markdown.render(Math.max(1, width));
    return mentions.length === 0 ? lines : painted(paint, lines, mentions);
  }

  sweep(): void {
    for (const text of this.#kept.keys()) if (!this.#used.has(text)) this.#kept.delete(text);
    this.#used.clear();
  }
}

/** Plain text in a style, or runs, wrapped to `width`. */
export const wrap = (paint: Paint, text: string | readonly Run[], width: number, style: Style | Tone = "ink"): string[] =>
  wrapTextWithAnsi(typeof text === "string" ? paint.text(text, style) : paint.runs(text), Math.max(1, width));

/** Lines moved `cells` in. */
const indent = (lines: readonly string[], cells: number): string[] => lines.map((line) => `${" ".repeat(cells)}${line}`);

/** Runs as one line, cut to `width` with a mark where they were cut. */
const oneOf = (paint: Paint, runs: readonly Run[], width: number): string => truncateToWidth(paint.runs(runs), Math.max(1, width), "…");

/** What a message says, at a width: that it was deleted, a command as it was written, an agent's Markdown, or a person's words as typed; or what a trigger's line brought, whole, behind a bar. */
function saidLines(paint: Paint, prose: Prose, row: MessageRow, width: number): string[] {
  if (row.kind === "trigger") return wrap(paint, row.text, width - 2, "ink3").map((line) => `${paint.text("▏ ", "line2")}${line}`);
  if (row.deleted) return wrap(paint, row.text, width, "ink3");
  if (row.command) return wrap(paint, row.text, width, role("code"));
  if (row.agent) return prose.lines(paint, row.text, width, row.mentions);
  return wrap(paint, mentionRuns(row.text, row.mentions, "ink"), width);
}

/**
 * A message of the thread as it now stands, after a blank line, and after a
 * line of its own where it is the first that was new: who said it and when,
 * marked if it was edited, what they said or that it was deleted, the emoji on
 * it, and what came of it where that is worth saying, a failure apart. An
 * agent's words are Markdown, in its pigment's name; a person's are drawn as
 * typed. Each `@name` of an agent is in that agent's pigment. A trigger's line
 * is drawn the same way, with the trigger in lantern light, and what it
 * brought shown whole.
 */
export function messageLines(paint: Paint, prose: Prose, row: MessageRow, width: number): string[] {
  const who: Style = { tone: row.kind === "trigger" ? role("busy") : row.agent && row.look !== undefined ? row.look.pigment : "ink", bold: true };
  const head: Run[] = [[row.who, who], [`  ${row.when}`, "ink3"]];
  if (row.edited !== undefined) head.push([`  ${row.edited}`, "ink3"]);
  const inner = width - 2;
  const mark = `┈┈┈ ${NEW_SINCE_SHORT} `;
  const fresh = row.firstNew ? ["", paint.text(`${mark}${"┈".repeat(Math.max(0, width - visibleWidth(mark)))}`, role("fresh"))] : [];
  const lines = [...fresh, "", oneOf(paint, head, width), ...indent(row.text === "" && !row.deleted ? [] : saidLines(paint, prose, row, inner), 2)];
  if (row.reactions.length > 0) lines.push(...indent(wrap(paint, reactionsLine(row.reactions), inner, "ink3"), 2));
  for (const { words, failed } of row.receipts) {
    lines.push(...indent(failed ? wrap(paint, `✗ ${words}`, inner, role("bad")) : wrap(paint, `· ${words}`, inner, "ink3"), 2));
  }
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
      const lines = [paint.text(`${step.label} ${step.when}`, "ink3"), ...indent(earlierLine(paint, step.earlier), 2)];
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
      const [mark, tone] = MARKS[step.state];
      const head: Run[] = [[`${mark} ${step.status}`, tone], ["  ", "ink"], [step.name, { tone: "ink", bold: true }]];
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
 * that works gets its name and what it is doing where it needs a name, in a room or beside others, and
 * where several work, only its latest step until tool calls are in full.
 */
export function workLines(paint: Paint, prose: Prose, works: readonly AgentWork[], named: boolean, width: number, inFull: InFull): string[] {
  if (works.length === 0) return [];
  const bar = paint.text("▎ ", role("busy", true));
  const pad = named ? 2 : 0;
  const keys = hintRuns(inFullHints(inFull));
  const lines = [""];
  works.forEach((each, index) => {
    const head: Run[] = named ? [[each.name, { tone: each.look.pigment, bold: true }], [` · ${each.doing}`, role("busy")]] : [];
    // Where the agent's name, what it is doing and the keys don't fit on one line, the keys go on a line of their own.
    const beside = index === 0 && runsWidth(head) + runsWidth(keys) + 2 <= width - 2;
    if (index === 0) lines.push(`${bar}${spread(paint, beside ? head : [], keys, width - 2)}`);
    if (named && !beside) lines.push(`${bar}${oneOf(paint, head, width - 2)}`);
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
