import {
  type Component,
  Container,
  Editor,
  isKeyRelease,
  Loader,
  matchesKey,
  ProcessTerminal,
  setCapabilityOverrides,
  Spacer,
  Text,
  type Terminal,
  TruncatedText,
  TuiMainScreen,
} from "@earendil-works/pi-tui";
import { agentNameOf, type ClientState, type Item, type Open } from "../../state/index.ts";
import { type InFull, type ListFilter, type MessageRow, modelLines, OUT_OF_DATE, writtenIn } from "../../view/index.ts";
import { commandList } from "./commands.ts";
import { interrupt } from "./interrupt.ts";
import { keysComponent } from "./keys.ts";
import { listOf, rowKey } from "./list.ts";
import { messageComponent } from "./message.ts";
import { type Front, type Screen, screenOf, type SessionScreen, type ThreadScreen } from "./screen.ts";
import { sessionComponents } from "./session.ts";
import { statusComponent } from "./status.ts";
import { createTheme } from "./theme.ts";
import { workComponent } from "./work.ts";
import { QUIT_AGAIN } from "./words.ts";

/** The terminal the console is drawn on. */
export type ConsoleTerminal = Terminal;

export interface DrawingOptions {
  state: ClientState;
  /** The person's terminal by default. */
  terminal?: ConsoleTerminal;
  /** The moment it is, for saying when things happened. */
  now?: () => number;
  /** How long after Ctrl+C another press still quits. 2 seconds by default. */
  quitWindowMs?: number;
  /** Told each screen as it is drawn, for a test that waits until one is. */
  onDraw?: (screen: Screen) => void;
}

export interface Drawing {
  /** Resolves when the person has asked to leave. */
  readonly left: Promise<void>;
  /** Leave as if the person had asked to. */
  leave(): void;
  /** The lines the console is showing at this width. */
  render(width: number): string[];
  /** Give the terminal back. */
  stop(): Promise<void>;
}

/**
 * Draw the console on a terminal, one level at a time, and carry what the
 * person types to the state: keys choose and open, send, and go back a level,
 * which is the console's own, narrow an agent's list to what is with the person
 * and widen it again, turn a thread over to the session behind it, switch tool
 * calls and thinking between brief and in full, and everything else they type
 * goes to the editor, which lists the commands of a thread while what is typed
 * starts with a slash, and the models of an agent after `/model `. The screen is
 * drawn again from the state's model after each change.
 */
export function startDrawing(options: DrawingOptions): Drawing {
  // A link in a message would show its text and hide where it goes. With this the address is printed with it.
  setCapabilityOverrides({ hyperlinks: false });

  const { state } = options;
  const now = options.now ?? Date.now;
  const theme = createTheme();
  const terminal = options.terminal ?? new ProcessTerminal();
  const tui = new TuiMainScreen(terminal);
  const page = new Container();
  tui.addChild(page);
  const editor = new Editor(tui, theme.editor, { paddingX: 1 });

  let leave: () => void = () => undefined;
  const left = new Promise<void>((resolve) => {
    leave = resolve;
  });

  let waitingForSecondPress = false;
  const quitting = interrupt({
    windowMs: options.quitWindowMs ?? 2000,
    waiting(armed) {
      waitingForSecondPress = armed;
      update();
    },
  });

  // Which level is in front. The state opens what the person chose, and going back is the console's alone.
  let front: Front = "agents";
  // What was open when the screen was last drawn, so that what the state opens, as it opens the only agent's list, is put in front.
  let listOpen = false;
  let itemOpen: Item | undefined;

  // What was typed for each thread that is not in front, so that leaving a thread doesn't lose or misplace it.
  const drafts = new Map<string, string>();
  let draftKey: string | undefined;
  const keyOf = (open: Open): string | undefined => {
    const { item } = open;
    return front === "item" && item?.kind === "thread" && item.place.kind !== "read-only"
      ? `${JSON.stringify(item.place)}\n${item.thread ?? "new"}`
      : undefined;
  };
  const syncDraft = (open: Open): void => {
    const key = keyOf(open);
    if (key === draftKey) return;
    if (draftKey !== undefined) {
      const typed = editor.getText();
      if (typed === "") drafts.delete(draftKey);
      else drafts.set(draftKey, typed);
    }
    draftKey = key;
    editor.setText(key === undefined ? "" : (drafts.get(key) ?? ""));
  };
  /** Put a message that was not sent back where it was typed, ahead of anything typed since. */
  const restore = (key: string | undefined, text: string): void => {
    if (key === undefined) return;
    if (key === draftKey) {
      const typed = editor.getText();
      editor.setText(typed === "" ? text : `${text}\n${typed}`);
      tui.requestRender();
    } else {
      const later = drafts.get(key);
      drafts.set(key, later === undefined ? text : `${text}\n${later}`);
    }
  };

  editor.onSubmit = (text) => {
    if (text === "") return;
    // A text that starts with a slash is a command. One for the console is acted on here and posted nowhere, and one
    // that is none is refused with a note and put back in the editor, so a message is never posted by mistake.
    const { item } = state.model().open;
    const written = item?.kind === "thread" ? writtenIn(text, item.place.kind === "agent" ? "dm" : "room") : ({ do: "post" } as const);
    switch (written.do) {
      case "status":
        void state.readStatus();
        return;
      case "model":
        void state.showModel();
        return;
      case "devices":
        state.readDevices();
        return;
      case "take-back":
        void state.takeBack(written.device);
        return;
      case "refuse":
        state.note(written.notice);
        restore(draftKey, text);
        return;
      case "post":
        break;
    }
    const key = draftKey;
    void state.send(text).then((sent) => {
      if (!sent) restore(key, text);
    });
  };

  let loader: Loader | undefined;
  const working = (message: string | undefined): Component | undefined => {
    if (message === undefined) {
      loader?.stop();
      loader = undefined;
      return undefined;
    }
    if (loader === undefined) loader = new Loader(tui, theme.spinner, theme.dim, message, theme.working);
    else loader.setMessage(message);
    return loader;
  };

  const messages = new Map<string, { key: string; component: Component }>();
  const messageView = (row: MessageRow): Component => {
    const key = JSON.stringify(row);
    const kept = messages.get(row.id);
    if (kept?.key === key) return kept.component;
    const component = messageComponent(row, theme);
    messages.set(row.id, { key, component });
    return component;
  };

  // What the person asked to see in full, wherever work is shown. It outlasts the screen it was asked on.
  const inFull: InFull = { toolCalls: false, thinking: false };
  // What an agent's list shows, which the person sets once and which stays as set for every agent while the console is open.
  let filter: ListFilter = "everything";
  // The screen as it was last drawn, which says what the keys do on it.
  let current: Screen = screenOf(state.model(), front, { now: now(), inFull, filter });
  // While what is typed in a thread starts with a slash, the editor lists the commands that can be written there, and the models of the agent after `/model `.
  editor.setAutocompleteProvider(
    commandList({
      commands: () => (current.kind === "thread" ? current.commands : []),
      async models() {
        const model = state.model();
        const { item } = model.open;
        if (item?.kind !== "thread" || item.place.kind !== "agent") return undefined;
        const models = await state.models();
        return models === undefined ? undefined : modelLines(models, agentNameOf(model, item.place.id));
      },
    }),
  );

  let chosen: string | undefined;
  // The kind of the screen drawn before this one, and whether an agent's screen was opened and has not been drawn whole yet.
  let before: Screen["kind"] | undefined;
  let landing = false;
  let focus: Component | null | undefined;
  const rows = (): number => tui.terminal.rows;

  /**
   * An agent's screen that is opened starts on the row where the agent is
   * working, if there is one, wherever it stands in the list. It waits until the
   * agent has said which sessions it has, so that a session behind no thread is
   * found too, and gives up if the person has chosen a row first. Coming back to
   * the list from a thread or a session is not opening it: the choice stays
   * where the person left it.
   */
  function landOnWork(screen: Screen): void {
    const agentList = screen.kind === "threads" && screen.ofAgent;
    if (agentList && before !== "threads" && before !== "thread" && before !== "session") landing = true;
    else if (!agentList) landing = false;
    before = screen.kind;
    if (!landing || screen.kind !== "threads" || !screen.settled || screen.rows.length === 0) return;
    landing = false;
    const busy = screen.rows.find((row) => row.working);
    if (busy !== undefined) chosen = rowKey(busy);
  }

  /** What the screen holds between its title and its notes, and what the keys go to. */
  function body(screen: Screen): { parts: Component[]; focus: Component | null } {
    switch (screen.kind) {
      // A channel the person only reads has no editor either, and what is typed goes nowhere.
      case "thread":
        return { parts: threadParts(screen), focus: screen.can.send ? editor : null };
      // A session is watched and not talked in, so there is no editor, and what is typed goes nowhere.
      case "session":
        return { parts: sessionParts(screen), focus: null };
      case "agents":
      case "threads": {
        // Nothing is being worked on in a list, so its spinner has no business running.
        working(undefined);
        const parts: Component[] = [];
        let list: Component | null = null;
        if (screen.rows.length === 0) {
          if (screen.empty !== undefined) parts.push(new Text(theme.dim(screen.empty), 0, 0));
        } else {
          list = listOf({
            rows: screen.rows,
            chosen,
            room: rows() - 8,
            theme,
            open: (row) => {
              if (row.kind === "agent") state.selectAgent(row.id);
              else if (row.kind === "room") state.selectRoom(row.id);
              else if (row.kind === "read-only") state.selectReadOnly(row.id);
              else if (row.kind === "session") state.openSession(row.id);
              else state.openThread(row.id);
              go(row.kind === "thread" || row.kind === "session" ? "item" : "list");
            },
            moved: (id) => {
              chosen = id;
              landing = false;
            },
          });
          parts.push(list);
        }
        return { parts, focus: list };
      }
    }
  }

  /** What the session holds, then what it is doing now, or that it is not, or that this may be out of date, and what waits for it. */
  function sessionParts(screen: SessionScreen): Component[] {
    const parts = sessionComponents(screen, theme);
    const line = working(screen.working);
    const status: Component[] = [];
    if (screen.idle !== undefined) status.push(new Text(theme.dim(screen.idle), 0, 0));
    if (screen.stale) status.push(new Text(theme.warn(`(${OUT_OF_DATE})`), 0, 0));
    for (const queued of screen.queued) status.push(new Text(theme.dim(queued), 0, 0));
    for (const waiting of screen.waiting) status.push(new Text(theme.dim(waiting), 0, 0));
    // The spinner has a blank line of its own above it.
    if (line !== undefined) parts.push(line);
    else if (status.length > 0 && screen.steps.length > 0) parts.push(new Spacer(1));
    parts.push(...status);
    return parts;
  }

  function threadParts(screen: ThreadScreen): Component[] {
    const parts: Component[] = [];
    if (screen.lead !== undefined) parts.push(new Text(theme.dim(screen.lead), 0, 1));
    const seen = new Set<string>();
    for (const row of screen.messages) {
      seen.add(row.id);
      parts.push(messageView(row));
    }
    for (const id of messages.keys()) if (!seen.has(id)) messages.delete(id);
    if (screen.work !== undefined) {
      parts.push(new Spacer(1));
      // What the person asked to see in full is not cut to half the screen.
      const whole = inFull.toolCalls || inFull.thinking;
      parts.push(workComponent(screen.work, screen.workStale, theme, () => (whole ? Number.POSITIVE_INFINITY : Math.max(6, Math.floor(rows() / 2)))));
    }
    const line = working(screen.working);
    if (line !== undefined) parts.push(line);
    if (screen.waiting.length > 0) {
      if (line === undefined) parts.push(new Spacer(1));
      for (const waiting of screen.waiting) parts.push(new Text(theme.dim(waiting), 0, 0));
    }
    if (screen.status !== undefined) parts.push(statusComponent(screen.status, theme));
    editor.borderColor = screen.working === undefined ? theme.editor.borderColor : theme.editorBusy;
    return parts;
  }

  /** Put `level` in front, and draw it. */
  function go(level: Front): void {
    front = level;
    update();
  }

  function update(): void {
    const model = state.model();
    const { list, item } = model.open;
    if (!listOpen && list !== undefined) front = item === undefined ? "list" : "item";
    else if (opened(itemOpen, item)) front = "item";
    listOpen = list !== undefined;
    itemOpen = item;
    // The person is looking at a thread for as long as it is in front, whichever side of it is on show.
    state.look(front === "item" && item?.kind === "thread");
    syncDraft(model.open);
    const screen = screenOf(model, front, { now: now(), inFull, filter });
    current = screen;
    landOnWork(screen);
    const { parts, focus: next } = body(screen);

    page.clear();
    // A conversation or a session scrolls its title away, and changing a line that far up repaints the whole screen, so only a list is marked.
    const scrolls = screen.kind === "thread" || screen.kind === "session";
    const stale = !scrolls && screen.stale ? `  ${theme.warn(`(${OUT_OF_DATE})`)}` : "";
    page.addChild(new TruncatedText(theme.title(screen.title) + stale, 0, 0));
    if (!scrolls) page.addChild(new Spacer(1));
    for (const part of parts) page.addChild(part);
    // The notes sit by what the person is doing, at the bottom, where a long conversation has not pushed them out of sight.
    if (screen.notes.length > 0 && (scrolls || parts.length > 0)) page.addChild(new Spacer(1));
    for (const note of screen.notes) page.addChild(new Text(theme.warn(note), 0, 0));
    if (screen.kind === "thread") {
      if (screen.can.send) page.addChild(editor);
      else if (screen.readOnly !== undefined) {
        // Where the input would be, a channel the person only reads says why there is none.
        page.addChild(new Spacer(1));
        page.addChild(new Text(theme.dim(screen.readOnly), 0, 0));
      }
    }
    page.addChild(waitingForSecondPress ? new Text(theme.warn(QUIT_AGAIN), 0, 0) : keysComponent(screen.keys, theme));

    if (focus !== next) {
      focus = next;
      tui.setFocus(next);
    }
    tui.requestRender();
    options.onDraw?.(screen);
  }

  tui.addInputListener((data) => {
    // A terminal that reports keys being let go sends one more event for each press, and a key is pressed once.
    if (isKeyRelease(data)) return undefined;
    if (matchesKey(data, "ctrl+c")) {
      // What is typed is only there to clear where there is an input to see it in.
      const pressed = quitting.press(current.can.send && editor.getText() !== "");
      if (pressed === "cleared") editor.setText("");
      if (pressed === "quit") leave();
      update();
      return { consume: true };
    }
    quitting.other();
    const { can } = current;
    if (matchesKey(data, "ctrl+d") && (current.kind !== "thread" || editor.getText() === "")) {
      leave();
      return { consume: true };
    }
    if (matchesKey(data, "escape") && can.back) {
      // Esc closes the list of commands when it is open, which the editor does. The next Esc goes back.
      if (editor.isShowingAutocomplete()) return undefined;
      go(current.kind === "thread" || current.kind === "session" ? "list" : "agents");
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+n") && can.newThread) {
      // In a thread, a new thread is started where that one is; on a list, with its agent or in its room.
      const { item } = state.model().open;
      state.startThread(current.kind === "thread" && item?.kind === "thread" ? item.place : undefined);
      go("item");
      return { consume: true };
    }
    if (matchesKey(data, "tab") && can.turnOver) {
      // While the editor lists commands, Tab is the editor's: it puts the chosen command in the input.
      if (editor.isShowingAutocomplete()) return undefined;
      state.turnOver();
      return { consume: true };
    }
    // Right narrows an agent's list to what is with the person, and Left widens it again.
    if ((matchesKey(data, "left") || matchesKey(data, "right")) && can.filter) {
      filter = matchesKey(data, "right") ? "yours" : "everything";
      update();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+o") && can.work) {
      inFull.toolCalls = !inFull.toolCalls;
      update();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+t") && can.work) {
      inFull.thinking = !inFull.thinking;
      update();
      return { consume: true };
    }
    return undefined;
  });

  const unsubscribe = state.subscribe(update);
  update();
  tui.start();

  let stopped = false;
  return {
    left,
    leave: () => leave(),
    render: (width) => tui.render(width),
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      loader?.stop();
      quitting.close();
      tui.stop();
      await terminal.drainInput(250, 25);
    },
  };
}

/**
 * Whether `now` is something other than `before` that was opened in the list:
 * a thread or a session told apart by its ID. A new thread that comes to be
 * with its first message is the one that was open.
 */
function opened(before: Item | undefined, now: Item | undefined): boolean {
  if (now === undefined) return false;
  if (before?.kind === "thread" && now.kind === "thread") return before.thread !== undefined && before.thread !== now.thread;
  if (before?.kind === "session" && now.kind === "session") return before.session !== now.session;
  return true;
}
