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
import {
  type InFull,
  type MessageRow,
  modelLines,
  OUT_OF_DATE,
  QUIT_AGAIN,
  type Screen,
  screenOf,
  type SessionScreen,
  terminalCommandOf,
  type ThreadScreen,
} from "../screen/index.ts";
import type { ConsoleState, Where } from "../state/index.ts";
import { commandList } from "./commands.ts";
import { interrupt } from "./interrupt.ts";
import { keysComponent } from "./keys.ts";
import { listOf } from "./list.ts";
import { messageComponent } from "./message.ts";
import { sessionComponents } from "./session.ts";
import { statusComponent } from "./status.ts";
import { createTheme } from "./theme.ts";
import { workComponent } from "./work.ts";

/** The terminal the console is drawn on. */
export type ConsoleTerminal = Terminal;

export interface DrawingOptions {
  state: ConsoleState;
  /** The person's terminal by default. */
  terminal?: ConsoleTerminal;
  /** The moment it is, for saying when things happened. */
  now?: () => number;
  /** How long after Ctrl+C another press still quits. 2 seconds by default. */
  quitWindowMs?: number;
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
 * Draw the console on a terminal and carry what the person types to the state:
 * keys choose, open, send and go back, switch tool calls and thinking between
 * brief and in full, and everything else they type goes to the editor, which
 * lists the commands of a thread while what is typed starts with a slash, and
 * the models of an agent after `/model `. The screen is drawn again from the
 * state's model after each change.
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

  // What was typed for each thread that is not open, so that leaving a thread doesn't lose or misplace it.
  const drafts = new Map<string, string>();
  let draftKey: string | undefined;
  const keyOf = (where: Where): string | undefined =>
    where.screen === "thread" ? `${JSON.stringify(where.place)}\n${where.thread ?? "new"}` : undefined;
  const syncDraft = (where: Where): void => {
    const key = keyOf(where);
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
    // A command for the terminal is acted on here and posted nowhere.
    const { where } = state.model();
    const command = where.screen === "thread" ? terminalCommandOf(text, where.place.kind === "agent" ? "dm" : "room") : undefined;
    if (command?.name === "status") {
      void state.readStatus();
      return;
    }
    if (command?.name === "model") {
      void state.chooseModel(command.choice);
      return;
    }
    const key = draftKey;
    void state.send(text).then((result) => {
      if (!result.ok) restore(key, text);
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
  // The screen as it was last drawn, which says what the keys do on it.
  let current: Screen = screenOf(state.model(), { now: now(), inFull });
  // While what is typed in a thread starts with a slash, the editor lists the commands that can be written there, and the models of the agent after `/model `.
  editor.setAutocompleteProvider(
    commandList({
      commands: () => (current.kind === "thread" ? current.commands : []),
      async models() {
        const { where } = state.model();
        if (where.screen !== "thread" || where.place.kind !== "agent") return undefined;
        const models = await state.models();
        return models === undefined ? undefined : modelLines(models, where.place.name);
      },
    }),
  );

  let chosen: string | undefined;
  let focus: Component | null | undefined;
  const rows = (): number => tui.terminal.rows;

  /** What the screen holds between its title and its notes, and what the keys go to. */
  function body(screen: Screen): { parts: Component[]; focus: Component | null } {
    switch (screen.kind) {
      case "thread":
        return { parts: threadParts(screen), focus: editor };
      // A session is watched and not talked in, so there is no editor, and what is typed goes nowhere.
      case "session":
        return { parts: sessionParts(screen), focus: null };
      case "agents":
      case "threads":
      case "sessions": {
        // Nothing is being worked on in a list, so its spinner has no business running.
        working(undefined);
        if (screen.rows.length === 0) {
          return { parts: screen.empty === undefined ? [] : [new Text(theme.dim(screen.empty), 0, 0)], focus: null };
        }
        const list = listOf({
          rows: screen.rows,
          chosen,
          room: rows() - 8,
          theme,
          open: (row) => {
            if (row.kind === "agent") state.selectAgent(row.id);
            else if (row.kind === "room") state.selectRoom(row.id);
            else if (row.kind === "session") state.openSession(row.id);
            else state.openThread(row.id);
          },
          moved: (id) => {
            chosen = id;
          },
        });
        return { parts: [list], focus: list };
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
    if (screen.status !== undefined) parts.push(statusComponent(screen.status, theme));
    editor.borderColor = screen.working === undefined ? theme.editor.borderColor : theme.editorBusy;
    return parts;
  }

  function update(): void {
    const model = state.model();
    syncDraft(model.where);
    const screen = screenOf(model, { now: now(), inFull });
    current = screen;
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
    if (screen.kind === "thread") page.addChild(editor);
    page.addChild(waitingForSecondPress ? new Text(theme.warn(QUIT_AGAIN), 0, 0) : keysComponent(screen.keys, theme));

    if (focus !== next) {
      focus = next;
      tui.setFocus(next);
    }
    tui.requestRender();
  }

  tui.addInputListener((data) => {
    // A terminal that reports keys being let go sends one more event for each press, and a key is pressed once.
    if (isKeyRelease(data)) return undefined;
    if (matchesKey(data, "ctrl+c")) {
      const where = state.model().where;
      const pressed = quitting.press(where.screen === "thread" && editor.getText() !== "");
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
      state.back();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+n") && can.newThread) {
      state.startThread();
      return { consume: true };
    }
    if (matchesKey(data, "tab") && can.switchLists) {
      state.switchLists();
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
