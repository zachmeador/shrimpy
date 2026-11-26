import { type Component, type Editor, stripTerminalSequences, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import { halves, SHRIMP } from "../../look/index.ts";
import { moreListed, OUT_OF_DATE_MARK } from "../../view/index.ts";
import { cutRuns, type Ground, role, type Run, runsWidth, type Tone } from "./paint.ts";
import { fileLines, pageHead, type PageLine, pageLines } from "./page.ts";
import { hint, lamp, noteRuns, saidRuns, spread } from "./rows.ts";
import { type Frame, MEASURE, notesFor, pageShown, type PageTarget, sides, writable } from "./screen.ts";
import { messageLines, type Prose, sessionLines, type ThreadLine, workLines, wrap } from "./steps.ts";
import { turnHint } from "./words.ts";

/** The shrimp that walks while an agent works, one frame after another. */
const WALK = ["🦐  ", " 🦐 ", "  🦐", " 🦐 "];

/** An agent's view of the session behind the open thread is on show. */
const viewing = (frame: Frame): boolean => frame.levels.session !== undefined;

/** The ground of the thread's pane: an agent's view is on the well, as code is, and a conversation on the pane. */
export const threadGround = (frame: Frame): Ground => (viewing(frame) ? "well" : "pane");

/** What is chat's is out of date while chat is not reached, and an agent's view while the agent is not. */
const stale = (frame: Frame): boolean => (viewing(frame) ? frame.levels.session?.stale === true : frame.model.chat.state === "down");

/** How wide what is said is drawn in a pane `width` wide: a cell in from each edge, and no wider than a line that reads well. */
const measure = (width: number): number => Math.max(1, Math.min(width - 2, MEASURE));

/** Whether the thread's pane shows an agent's page, or a file of its home, in place of a thread. */
const onPage = (frame: Frame): boolean => pageShown(frame.model) && frame.levels.page !== undefined;

/**
 * The head of the thread's pane: whose conversation it is and what it is
 * called, or whose view and of what, out of date while it may be, with where
 * Tab goes beside it; then who is in it, and a rule. Where an agent's page
 * stands, its head. Nothing while nothing is open in a room's list or a
 * channel's. A click on Tab's hint does what Tab does.
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
    if (onPage(frame)) return pageHead(frame, width).map((line) => paint.lay(line, width, on));
    if (item === undefined) return [];
    const late: Run[] = stale(frame) ? [[` ${OUT_OF_DATE_MARK}`, role("caution")]] : [];
    const at = sides(model);
    const turn: Run[] = at.count > 0 || at.at > 0 ? hint(turnHint(at.count, at.at)) : [];
    const lines: string[] = [];
    const session = levels.session;
    if (session !== undefined) {
      const who: Run = [session.who, { tone: session.look.pigment, bold: true }];
      lines.push(spread(paint, [[" ", "ink"], who, [" · ", "ink3"], [session.watching, "ink"], ...late], turn, width));
    } else if (levels.thread !== undefined) {
      const thread = levels.thread;
      const who: Run = [thread.who, { tone: thread.look?.pigment ?? "ink", bold: true }];
      // The word that marks the thread stays whole, and what it is called is cut short to leave it room.
      const tag: Run[] = thread.tag === undefined ? [] : [[" ", "ink"], [` ${thread.tag} `, { tone: "ink3", on: "well" }]];
      const said = cutRuns([[" ", "ink"], who, [" · ", "ink3"], [thread.called, "ink"], ...late], Math.max(0, width - (turn.length > 0 ? runsWidth(turn) + 2 : 1) - runsWidth(tag)));
      lines.push(spread(paint, [...said, ...tag], turn, width));
      lines.push(spread(paint, [[" ", "ink"], [thread.sub.join(" · "), "ink3"]], [], width));
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

export interface ConversationActions {
  openTarget: (target: PageTarget) => void;
  jump: (agent: string, threadId: string) => void;
}

/**
 * What the thread's pane scrolls: what was said and the work going on beside
 * it, or an agent's view of it; on an agent's list with nothing open in it,
 * the agent's page or a file of its home; and while nothing is open in another
 * list, a picture pressed into the pane and what to pick. It fills what the
 * head, the dock and the input leave of the pane, and dims while what it shows
 * may be out of date. A click on a selectable page row or an answer wake line
 * opens what it points to.
 */
export class Conversation implements Component {
  readonly #frame: Frame;
  readonly #prose: Prose;
  readonly #beside: (width: number) => number;
  readonly #actions: ConversationActions;
  // What was said when it was last drawn, which only a change of the state, a key or the width changes: what moves does not.
  #kept: { levels: Frame["levels"]; paint: Frame["paint"]; width: number; lines: ThreadLine[] } | undefined;
  // The drawn lines with their click handlers and page target keys.
  #drawn: { key?: string; go?: (column: number) => void }[] = [];

  constructor(frame: Frame, prose: Prose, beside: (width: number) => number, actions: ConversationActions) {
    this.#frame = frame;
    this.#prose = prose;
    this.#beside = beside;
    this.#actions = actions;
  }

  /** Which line of the page, as it was last drawn, the target with `key` is on. */
  lineOf(key: string): number | undefined {
    const at = this.#drawn.findIndex((line) => line.key === key);
    return at === -1 ? undefined : at;
  }

  /** What is said, as lines that are not laid on a ground, for the thread printed back on leaving. */
  said(width: number): string[] {
    return this.#saidLines(width).map((line) => line.text);
  }

  #saidLines(width: number): ThreadLine[] {
    const { levels, paint } = this.#frame;
    const kept = this.#kept;
    if (kept?.levels === levels && kept.paint === paint && kept.width === width) return [...kept.lines];
    const lines = this.#said(width);
    this.#kept = { levels, paint, width, lines };
    return [...lines];
  }

  #said(width: number): ThreadLine[] {
    const frame = this.#frame;
    const { paint, levels, model, inFull } = frame;
    const mx = measure(width);
    const lines: ThreadLine[] = [];
    const session = levels.session;
    const thread = levels.thread;
    const lead = session?.lead ?? thread?.lead;
    if (lead !== undefined) lines.push({ text: "" }, ...wrap(paint, saidRuns(lead, "ink3", role("code")), mx).map((text) => ({ text })));
    if (session !== undefined) {
      lines.push(...sessionLines(paint, this.#prose, session.steps, mx, inFull).map((text) => ({ text })));
    } else if (thread !== undefined) {
      thread.messages.forEach((message, at) => {
        lines.push(...messageLines(paint, this.#prose, message, mx, { inFull, previous: thread.messages[at - 1], jump: this.#actions.jump }));
      });
      const dm = model.open.item?.place.kind === "agent";
      lines.push(...workLines(paint, this.#prose, thread.works, thread.works.length > 1 || !dm, mx, inFull).map((text) => ({ text })));
    }
    this.#prose.sweep();
    const shown = stale(frame) ? lines.map((line) => ({ ...line, text: paint.text(stripTerminalSequences(line.text), "ink3") })) : lines;
    return shown.map((line) => ({ ...line, text: ` ${line.text}` }));
  }

  render(width: number): string[] {
    const frame = this.#frame;
    const on = threadGround(frame);
    const room = Math.max(1, frame.height() - this.#beside(width));
    if (onPage(frame)) return this.#onPage(width, room);
    if (frame.model.open.item === undefined) {
      this.#drawn = [];
      const lines = emptyPane(frame, width, room);
      while (lines.length < room) lines.push("");
      return lines.map((line) => frame.paint.lay(line, width, on));
    }
    const said = this.#saidLines(width);
    this.#drawn = said.map((line) => (line.go === undefined ? {} : { go: () => line.go?.() }));
    const lines = said.map((line) => line.text);
    while (lines.length < room) lines.push("");
    return lines.map((line) => frame.paint.lay(line, width, on));
  }

  /** The agent's page, or the file of its home open where it was, each line on its own ground, the chosen row raised. */
  #onPage(width: number, room: number): string[] {
    const frame = this.#frame;
    const { paint, levels } = frame;
    const mx = measure(width);
    const lines: PageLine[] = levels.file === undefined ? pageLines(frame, mx, this.#actions.openTarget) : fileLines(frame, levels.file, mx);
    this.#drawn = lines;
    const drawn = lines.map((line) => paint.lay(`${paint.runs([line.bar ?? [" ", "ink"]])}${line.text}`, width, line.on ?? "pane"));
    while (drawn.length < room) drawn.push(paint.lay("", width, "pane"));
    return drawn;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left") return undefined;
    const go = this.#drawn[event.y]?.go;
    if (go === undefined) return undefined;
    go(event.x);
    return { handled: true };
  }

  invalidate(): void {}
}

/** Where a thread would be while none is open, but on an agent's list, where its page stands: the shrimp pressed into the pane, and what the views say stands there. */
function emptyPane(frame: Frame, width: number, height: number): string[] {
  const { paint, levels } = frame;
  const art = halves(SHRIMP);
  const said = wrap(paint, levels.nothing ?? "", Math.max(1, width - 4), "ink3");
  const top = Math.max(1, Math.floor((height - art.length - 2 - said.length) / 2));
  const centered = (line: string): string => `${" ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2)))}${line}`;
  return [
    ...Array.from({ length: top }, () => ""),
    ...art.map((line) => centered(paint.text(line, "press"))),
    "",
    "",
    ...said.map(centered),
  ];
}

/**
 * The dock under what is said: what is not working, what `/status` read, who
 * is working with the shrimp walking (and how to stop it on a read-only
 * thread), what is queued, what is still going in the thread (background
 * processes, open watches, upcoming triggers, and reverse watches), and where
 * the input would be in a thread only read, why there is none.
 */
export class Dock implements Component {
  readonly #frame: Frame;
  readonly #jump: (agent: string, threadId: string) => void;
  #lines: ThreadLine[] = [];

  constructor(frame: Frame, jump: (agent: string, threadId: string) => void) {
    this.#frame = frame;
    this.#jump = jump;
  }

  render(width: number): string[] {
    const frame = this.#frame;
    const { paint, levels, model } = frame;
    const { item } = model.open;
    if (item === undefined) {
      this.#lines = [];
      return [];
    }
    const mx = measure(width);
    const lines: ThreadLine[] = [];
    const add = (text: string, go?: () => void): void => void lines.push(go === undefined ? { text } : { text, go });
    const one = (runs: readonly Run[], right: readonly Run[] = [], go?: () => void): void => add(spread(paint, runs, right, mx + 1), go);
    for (const note of notesFor(frame, "item")) for (const line of wrap(paint, noteRuns(note), mx)) add(line);
    const walking = WALK[frame.tick % WALK.length] ?? "";
    const thread = levels.thread;
    if (thread !== undefined) {
      if (thread.status !== undefined) {
        add(paint.text(thread.status.header, "ink3"));
        for (const row of thread.status.rows) for (const line of wrap(paint, row, Math.max(1, mx - 2), "ink2")) add(`  ${line}`);
        add("");
      }
      if (thread.working !== undefined) {
        // Where the names of several agents don't fit, the line says how many.
        const fits = visibleWidth(`${walking} ${thread.working}`) <= mx;
        one([[walking, "ink"], [` ${fits ? thread.working : (thread.workingCounted ?? thread.working)}`, role("busy")]]);
        if (thread.stopCommand !== undefined) {
          for (const line of wrap(paint, saidRuns(thread.stopCommand, "ink3", role("code")), mx)) add(line);
        }
      }
      for (const queued of thread.queued) one([[queued, "ink3"]]);
      const can = writable(frame);
      const { still } = thread;
      const [proc] = still.processes;
      if (proc !== undefined) {
        const whose = still.manyAgents ? `${proc.agentName} · ` : "";
        const right: Run[] =
          still.processes.length > 1
            ? [[`running ${proc.since} · `, "ink3"], [moreListed(still.processes.length - 1), "ink2"]]
            : can
              ? [[`running ${proc.since} · `, "ink3"], ["/kill", "ink2"]]
              : [[`running ${proc.since}`, "ink3"]];
        one([["▪ ", lamp(frame.tick)], [`${whose}$ ${proc.command}`, "ink2"]], right);
        if (frame.inFull.toolCalls && proc.output !== undefined) {
          if (Array.isArray(proc.output)) {
            for (const line of proc.output.slice(-4)) one([["  ▏ ", "line2"], [line, "ink3"]]);
          } else {
            for (const line of wrap(paint, proc.output.note, Math.max(1, mx - 4), role("caution"))) add(`${paint.text("  ▏ ", "line2")}${line}`);
          }
        }
      }
      for (const by of [...new Set(still.watches.map((watch) => watch.byAgent))]) {
        const mine = still.watches.filter((watch) => watch.byAgent === by);
        const [first] = mine;
        if (first === undefined) continue;
        const stuck = mine.find((watch) => !watch.onRunning);
        const on: Run[] = mine.flatMap((watch, index): Run[] => [
          ...(index > 0 ? ([[" · ", "ink3"]] as Run[]) : []),
          [watch.onName, { tone: watch.onLook.pigment, bold: true }],
          [` ${watch.since}`, "ink3"],
          ...(watch.onRunning ? ([] as Run[]) : ([[", not running", role("caution")]] as Run[])),
        ]);
        const lead = still.manyAgents ? `${first.byName} is waiting on ` : "waiting on ";
        const right: Run[] = can && stuck !== undefined ? [[`/drop ${stuck.onName}`, "ink2"]] : [];
        one([["○ ", "ink3"], [lead, "ink3"], ...on], right, () => this.#jump(by, first.toThread));
      }
      const [trigger] = still.triggers;
      if (trigger !== undefined) {
        const whose = still.manyAgents ? `${trigger.agentName} · ` : "";
        const said =
          trigger.kind === "once"
            ? `once at ${trigger.when}: ${trigger.say}`
            : `trigger ${trigger.id} · ${trigger.say} · ${trigger.on && trigger.when !== "paused" ? `next ${trigger.when}` : "paused"}`;
        const right: Run[] =
          still.triggers.length > 1
            ? [[moreListed(still.triggers.length - 1), "ink2"]]
            : can
              ? [[trigger.kind === "once" ? "/cancel" : trigger.on ? "/pause" : "/resume", "ink2"]]
              : [];
        one([["◷ ", "ink3"], [`${whose}${said}`, "ink3"]], right);
      }
      for (const wait of still.waitedBy) {
        one(
          [["○ ", "ink3"], [wait.byName, { tone: wait.byLook.pigment, bold: true }], [" waits on this from ", "ink3"], [wait.fromLabel, { tone: "ink2", underline: true }]],
          [],
          () => this.#jump(wait.byAgent, wait.fromThread),
        );
      }
      if (thread.readOnly !== undefined) for (const line of wrap(paint, saidRuns(thread.readOnly, "ink3", role("code")), mx)) add(line);
      // While chat is lost the input goes, and a blank line stands where it was.
      else if (thread.writable && !can) add("");
    }
    // The input, under the dock, is set off from what is said by a blank line too.
    if (lines.length === 0 && !writable(frame)) {
      this.#lines = [];
      return [];
    }
    const all: ThreadLine[] = [{ text: "" }, ...lines];
    this.#lines = all;
    const on = threadGround(frame);
    return all.map(({ text }) => paint.lay(text === "" ? "" : ` ${text}`, width, on));
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left") return undefined;
    const go = this.#lines[event.y]?.go;
    if (go === undefined) return undefined;
    go();
    return { handled: true };
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

  render(width: number): string[] {
    const frame = this.#frame;
    if (!writable(frame)) return [];
    const busy = frame.levels.thread?.working !== undefined;
    const tone: Tone = busy ? role("busy", true) : "line2";
    this.#editor.borderColor = (text) => frame.paint.text(text, tone);
    const { start, end } = this.#cursor;
    const lines = this.#editor.render(measure(width));
    const shown = this.#editor.focused ? lines : lines.map((line) => line.replaceAll(start, "").replaceAll(end, ""));
    const on = threadGround(frame);
    return shown.map((line) => frame.paint.lay(` ${line}`, width, on));
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!writable(this.#frame)) return undefined;
    const result = this.#editor.handleMouse({ ...event, x: event.x - 1, width: measure(event.width) });
    if (result === undefined) return undefined;
    // The keys go to the editor by way of the thread being in front, which the drawing decides.
    this.#focus();
    return { ...result, focus: false };
  }

  invalidate(): void {
    this.#editor.invalidate();
  }
}
