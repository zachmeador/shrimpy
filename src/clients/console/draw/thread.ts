import { type Component, type Editor, stripTerminalSequences, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import { YOUR_DM } from "../../../contracts/agent/index.ts";
import { notTalkedTo } from "../../../contracts/chat/index.ts";
import { halves, WORDMARK } from "../../look/index.ts";
import { moreWakeups, notRunning, OUT_OF_DATE, PICK_LIST, PICK_THREAD, READ_ONLY_TAG } from "../../view/index.ts";
import type { Ground, Run, Tone } from "./paint.ts";
import { hint, spread } from "./rows.ts";
import { type Frame, listRowKey, MEASURE, notesFor, rowKey, sides, writable } from "./screen.ts";
import { messageLines, type Prose, sessionLines, workLines, wrap } from "./steps.ts";
import { emptyAgentList, PICK_OR_START, turnHint } from "./words.ts";

/** The shrimp that walks while an agent works, one frame after another. */
const WALK = ["🦐  ", " 🦐 ", "  🦐", " 🦐 "];

/** An agent's view of the session behind the open thread, or a session behind no thread, is on show. */
const viewing = (frame: Frame): boolean => frame.levels.session !== undefined;

/** The ground of the thread's pane: an agent's view is on the well, as code is, and a conversation on the pane. */
export const threadGround = (frame: Frame): Ground => (viewing(frame) ? "well" : "pane");

/** What is chat's is out of date while chat is not reached, and an agent's view while the agent is not. */
const stale = (frame: Frame): boolean => (viewing(frame) ? frame.levels.session?.stale === true : frame.model.chat.state === "down");

/** How wide what is said is drawn in a pane `width` wide: a cell in from each edge, and no wider than a line that reads well. */
const measure = (width: number): number => Math.max(1, Math.min(width - 2, MEASURE));

/**
 * The head of the thread's pane: whose conversation it is and what it is
 * called, or whose view and of what, out of date while it may be, with where
 * Tab goes beside it; then who is in it, and a rule. Nothing while no thread or
 * session is open. A click on Tab's hint does what Tab does.
 */
export class ThreadHeader implements Component {
  #turn: { from: number; to: number } | undefined;
  readonly #frame: Frame;
  readonly #turnOver: () => void;
  readonly #focus: () => void;

  constructor(frame: Frame, turnOver: () => void, focus: () => void) {
    this.#frame = frame;
    this.#turnOver = turnOver;
    this.#focus = focus;
  }

  render(width: number): string[] {
    const frame = this.#frame;
    const { paint, levels, model } = frame;
    const { item } = model.open;
    const on = threadGround(frame);
    this.#turn = undefined;
    if (item === undefined) return [];
    const late: Run[] = stale(frame) ? [[` (${OUT_OF_DATE})`, "sand"]] : [];
    const at = sides(model);
    const turn: Run[] = item.kind === "thread" && (at.count > 0 || at.at > 0) ? hint(turnHint(at.count, at.at)) : [];
    const lines: string[] = [];
    const session = levels.session;
    if (session !== undefined) {
      lines.push(spread(paint, [[" ", "ink"], ...named(session.title, nameOf(frame, session.agent), { tone: session.look.pigment, bold: true }), ...late], turn, width));
    } else if (levels.thread !== undefined && item.kind === "thread") {
      const place = item.place;
      const row = levels.agents.rows.find((each) => rowKey(each) === listRowKey(place));
      const who = row?.label;
      const style = place.kind === "agent" && row?.look !== undefined ? { tone: row.look.pigment, bold: true } : { tone: "ink" as const, bold: true };
      lines.push(spread(paint, [[" ", "ink"], ...named(levels.thread.title, who, style), ...late], turn, width));
      const sub = place.kind === "agent" ? YOUR_DM : (row?.detail ?? READ_ONLY_TAG);
      lines.push(spread(paint, [[" ", "ink"], [sub, "ink3"]], [], width));
    }
    if (turn.length > 0) {
      const end = width - 1;
      const from = end - turn.reduce((sum, [text]) => sum + visibleWidth(text), 0);
      this.#turn = { from, to: end };
    }
    lines.push(paint.text("─".repeat(width), "line"));
    return lines.map((line) => paint.lay(line, width, on));
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left") return undefined;
    const turn = this.#turn;
    if (event.y === 0 && turn !== undefined && event.x >= turn.from && event.x < turn.to) this.#turnOver();
    else this.#focus();
    return { handled: true };
  }

  invalidate(): void {}
}

/** A title that starts with a name and " · ", with the name in `style`, the dot dim and the rest in ink. */
function named(title: string, name: string | undefined, style: Run[1]): Run[] {
  const lead = `${name ?? ""} · `;
  if (name !== undefined && title.startsWith(lead)) return [[name, style], [" · ", "ink3"], [title.slice(lead.length), "ink"]];
  return [[title, { tone: "ink", bold: true }]];
}

/** An agent's name as the agents and rooms have it. */
const nameOf = (frame: Frame, agent: string): string | undefined =>
  frame.levels.agents.rows.find((each) => each.kind === "agent" && each.id === agent)?.label;

/**
 * What the thread's pane scrolls: what was said and the work going on beside
 * it, an agent's view of it, or a session behind no thread; and while nothing
 * is open, a picture pressed into the pane and what to pick. It fills what the
 * head, the dock and the input leave of the pane, and dims while what it shows
 * may be out of date.
 */
export class Conversation implements Component {
  readonly #frame: Frame;
  readonly #prose: Prose;
  readonly #beside: (width: number) => number;
  // What was said when it was last drawn, which only a change of the state, a key or the width changes: what moves does not.
  #kept: { levels: Frame["levels"]; paint: Frame["paint"]; width: number; lines: string[] } | undefined;

  constructor(frame: Frame, prose: Prose, beside: (width: number) => number) {
    this.#frame = frame;
    this.#prose = prose;
    this.#beside = beside;
  }

  /** What is said, as lines that are not laid on a ground, for the pane or for the thread printed back on leaving. */
  said(width: number): string[] {
    const { levels, paint } = this.#frame;
    const kept = this.#kept;
    if (kept?.levels === levels && kept.paint === paint && kept.width === width) return [...kept.lines];
    const lines = this.#said(width);
    this.#kept = { levels, paint, width, lines };
    return [...lines];
  }

  #said(width: number): string[] {
    const frame = this.#frame;
    const { paint, levels, model, inFull } = frame;
    const mx = measure(width);
    const lines: string[] = [];
    const session = levels.session;
    const thread = levels.thread;
    const lead = session?.lead ?? thread?.lead;
    if (lead !== undefined) lines.push("", ...wrap(paint, lead, mx, "ink3"));
    if (session !== undefined) {
      lines.push(...sessionLines(paint, this.#prose, session.steps, mx, inFull));
    } else if (thread !== undefined) {
      for (const message of thread.messages) lines.push(...messageLines(paint, this.#prose, message, mx));
      const dm = model.open.item?.kind === "thread" && model.open.item.place.kind === "agent";
      lines.push(...workLines(paint, this.#prose, thread.works, thread.works.length > 1 || !dm, mx, inFull));
    }
    this.#prose.sweep();
    const shown = stale(frame) ? lines.map((line) => paint.text(stripTerminalSequences(line), "ink3")) : lines;
    return shown.map((line) => ` ${line}`);
  }

  render(width: number): string[] {
    const frame = this.#frame;
    const on = threadGround(frame);
    const room = Math.max(1, frame.height() - this.#beside(width));
    const lines = frame.model.open.item === undefined ? emptyPane(frame, width, room) : this.said(width);
    while (lines.length < room) lines.push("");
    return lines.map((line) => frame.paint.lay(line, width, on));
  }

  invalidate(): void {}
}

/** Where a thread would be while none is open: the open agent's sigil, or the wordmark, pressed into the pane, and what to pick. */
function emptyPane(frame: Frame, width: number, height: number): string[] {
  const { paint, levels, model } = frame;
  const list = levels.list;
  const agent = model.open.list?.kind === "agent" ? model.open.list.id : undefined;
  const art = halves(agent === undefined ? WORDMARK : (list?.look?.sigil ?? []));
  let words = PICK_LIST;
  if (list !== undefined && agent === undefined) words = PICK_THREAD;
  else if (list !== undefined && !frame.running.has(agent ?? "")) words = notRunning(list.name);
  else if (list !== undefined) words = list.rows.some((each) => each.yours) ? PICK_OR_START : emptyAgentList(notTalkedTo(list.name), list.name, false);
  const said = wrap(paint, words, Math.max(1, width - 4), "ink3");
  const top = Math.max(1, Math.floor((height - art.length - 2 - said.length) / 2));
  const centered = (line: string): string => `${" ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2)))}${line}`;
  return [
    ...Array.from({ length: top }, () => ""),
    ...art.map((line) => centered(paint.text(line, "press"))),
    "",
    ...said.map(centered),
  ];
}

/**
 * The dock under what is said: what is not working, what `/status` read, who
 * is working with the shrimp walking, what is queued, the soonest wake-up with
 * how many more `/status` lists, and where the input would be in a thread only
 * read, why there is none. A session behind no thread says what it is doing.
 */
export class Dock implements Component {
  readonly #frame: Frame;

  constructor(frame: Frame) {
    this.#frame = frame;
  }

  render(width: number): string[] {
    const frame = this.#frame;
    const { paint, levels, model } = frame;
    const { item } = model.open;
    if (item === undefined) return [];
    const mx = measure(width);
    const lines: string[] = [];
    const one = (runs: readonly Run[], right: readonly Run[] = []): void => void lines.push(spread(paint, runs, right, mx + 1));
    for (const note of notesFor(frame, "item")) lines.push(...wrap(paint, note, mx, "sand"));
    const walking = WALK[frame.tick % WALK.length] ?? "";
    if (item.kind === "session") {
      const session = levels.session;
      if (session !== undefined) {
        if (session.stale) lines.push(paint.text(`(${OUT_OF_DATE})`, "sand"));
        if (session.working !== undefined) one([[walking, "ink"], [` ${session.working}`, "ochre"]]);
        if (session.idle !== undefined) one([[session.idle, "ink3"]]);
        for (const queued of session.queued) one([[queued, "ink3"]]);
        for (const waiting of session.waiting) one([["◷ ", "ink3"], [waiting, "ink3"]]);
      }
    } else if (levels.thread !== undefined) {
      const thread = levels.thread;
      if (thread.status !== undefined) {
        lines.push(paint.text(thread.status.header, "ink3"));
        for (const row of thread.status.rows) lines.push(...wrap(paint, row, mx - 2, "ink2").map((line) => `  ${line}`));
        lines.push("");
      }
      if (thread.working !== undefined) one([[walking, "ink"], [` ${thread.working}`, "ochre"]]);
      for (const queued of thread.queued) one([[queued, "ink3"]]);
      const [soonest, ...more] = thread.waiting;
      if (soonest !== undefined) one([["◷ ", "ink3"], [soonest.line, "ink3"]], more.length > 0 ? [[moreWakeups(more.length), "ink2"]] : []);
      if (thread.readOnly !== undefined) lines.push(...wrap(paint, thread.readOnly, mx, "ink3"));
    }
    if (lines.length === 0) return [];
    const on = threadGround(frame);
    return ["", ...lines].map((line) => paint.lay(line === "" ? "" : ` ${line}`, width, on));
  }

  invalidate(): void {}
}

/**
 * The input of a thread the person can write in, laid on the pane, under the
 * agent's view too: the editor, with its rules, ochre while an agent works,
 * and the list of commands under it. Its cursor shows while the keys are in
 * the thread. A click in it puts the keys there.
 */
export class Input implements Component {
  readonly #frame: Frame;
  readonly #editor: Editor;
  readonly #focus: () => void;
  readonly #cursor: { start: string; end: string };

  constructor(frame: Frame, editor: Editor, focus: () => void, cursor: { start: string; end: string }) {
    this.#frame = frame;
    this.#editor = editor;
    this.#focus = focus;
    this.#cursor = cursor;
  }

  /** How wide the editor is drawn in a pane `width` wide. */
  #inner = (width: number): number => Math.max(1, Math.min(width, MEASURE + 2) - 2);

  render(width: number): string[] {
    const frame = this.#frame;
    if (!writable(frame)) return [];
    const busy = frame.levels.thread?.working !== undefined;
    const tone: Tone = busy ? "ochre mark" : "line2";
    this.#editor.borderColor = (text) => frame.paint.text(text, tone);
    const { start, end } = this.#cursor;
    const lines = this.#editor.render(this.#inner(width));
    const shown = this.#editor.focused ? lines : lines.map((line) => line.replaceAll(start, "").replaceAll(end, ""));
    const on = threadGround(frame);
    return shown.map((line) => frame.paint.lay(` ${line}`, width, on));
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!writable(this.#frame)) return undefined;
    const result = this.#editor.handleMouse({ ...event, x: event.x - 1, width: this.#inner(event.width) });
    if (result === undefined) return undefined;
    // The keys go to the editor by way of the thread being in front, which the drawing decides.
    this.#focus();
    return { ...result, focus: false };
  }

  invalidate(): void {
    this.#editor.invalidate();
  }
}
