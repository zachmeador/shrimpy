import {
  type Component,
  Container,
  Editor,
  Loader,
  matchesKey,
  ProcessTerminal,
  setCapabilityOverrides,
  Spacer,
  Text,
  type Terminal,
  TuiMainScreen,
} from "@earendil-works/pi-tui";
import { OUT_OF_DATE, QUIT_AGAIN, type MessageRow, type Screen, screenOf, type ThreadScreen } from "../screen/index.ts";
import type { ConsoleState, Where } from "../state/index.ts";
import { interrupt } from "./interrupt.ts";
import { listOf } from "./list.ts";
import { messageComponent } from "./message.ts";
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
 * keys choose, open, send, stop and go back, and everything else they type goes
 * to the editor. The screen is drawn again from the state's model after each
 * change.
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
    where.screen === "thread" ? `${where.agent}\n${where.thread ?? "new"}` : undefined;
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

  let chosen: string | undefined;
  let focus: Component | undefined;
  const rows = (): number => tui.terminal.rows;

  function body(screen: Screen): { parts: Component[]; focus: Component } {
    if (screen.kind !== "thread") {
      if (screen.rows.length === 0) {
        return { parts: screen.empty === undefined ? [] : [new Text(theme.dim(screen.empty), 0, 0)], focus: editor };
      }
      const list = listOf({
        rows: screen.rows,
        chosen,
        room: rows() - 8,
        theme,
        open: (id) => (screen.kind === "agents" ? state.selectAgent(id) : state.openThread(id)),
        moved: (id) => {
          chosen = id;
        },
      });
      return { parts: [list], focus: list };
    }
    return { parts: threadParts(screen), focus: editor };
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
      parts.push(workComponent(screen.work, screen.workStale, theme, () => Math.max(6, Math.floor(rows() / 2))));
    }
    const line = working(screen.working);
    if (line !== undefined) parts.push(line);
    editor.borderColor = screen.working === undefined ? theme.editor.borderColor : theme.editorBusy;
    parts.push(editor);
    return parts;
  }

  function update(): void {
    const model = state.model();
    syncDraft(model.where);
    const screen = screenOf(model, { now: now() });
    const { parts, focus: next } = body(screen);

    page.clear();
    const stale = screen.stale ? `  ${theme.warn(`(${OUT_OF_DATE})`)}` : "";
    page.addChild(new Text(theme.title(screen.title) + stale, 0, 0));
    for (const note of screen.notes) page.addChild(new Text(note.tone === "warn" ? theme.warn(note.text) : theme.dim(note.text), 0, 0));
    if (screen.kind !== "thread") page.addChild(new Spacer(1));
    for (const part of parts) page.addChild(part);
    page.addChild(new Text(waitingForSecondPress ? theme.warn(QUIT_AGAIN) : theme.dim(screen.keys), 0, 0));

    if (focus !== next) {
      focus = next;
      tui.setFocus(next);
    }
    tui.requestRender();
  }

  tui.addInputListener((data) => {
    if (matchesKey(data, "ctrl+c")) {
      const where = state.model().where;
      const pressed = quitting.press(where.screen === "thread" && editor.getText() !== "");
      if (pressed === "cleared") editor.setText("");
      if (pressed === "quit") leave();
      update();
      return { consume: true };
    }
    quitting.other();
    switch (state.model().where.screen) {
      case "thread":
        if (matchesKey(data, "escape")) {
          void state.stop();
          return { consume: true };
        }
        if (matchesKey(data, "ctrl+t")) {
          state.back();
          return { consume: true };
        }
        if (matchesKey(data, "ctrl+n")) {
          state.startThread();
          return { consume: true };
        }
        break;
      case "threads":
        if (matchesKey(data, "escape")) {
          state.back();
          return { consume: true };
        }
        if (data === "n") {
          state.startThread();
          return { consume: true };
        }
        break;
      case "agents":
        break;
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
