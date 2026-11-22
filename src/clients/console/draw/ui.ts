import {
  type Component,
  Editor,
  type EditorTheme,
  getTerminalColorMode,
  HStack,
  isKeyRelease,
  matchesKey,
  type OverlayHandle,
  ProcessTerminal,
  renderFakeCursor,
  ScrollView,
  setCapabilityOverrides,
  type Terminal,
  TuiAltScreen,
  VStack,
} from "@earendil-works/pi-tui";
import { agentNameOf, type ClientState, type Item, type Open } from "../../state/index.ts";
import { type ListFilter, modelLines, type Row, windowTitle, writtenIn } from "../../view/index.ts";
import { commandList } from "./commands.ts";
import { interrupt } from "./interrupt.ts";
import { KEYS_WIDTH, KeysLine, KeysList } from "./keys.ts";
import { drawList } from "./list.ts";
import { createPaint, isLight } from "./paint.ts";
import { drawRail } from "./rail.ts";
import { Pane } from "./rows.ts";
import {
  draftKeyOf,
  type Frame,
  type Level,
  levelsAt,
  levelsOf,
  LIST,
  listRowKey,
  listRows,
  notesFor,
  onShow,
  openedKey,
  RAIL,
  rowKey,
  runningIn,
  type Screen,
  screenOf,
  writable,
} from "./screen.ts";
import { Prose } from "./steps.ts";
import { Conversation, Dock, Input, ThreadHeader } from "./thread.ts";
import { CLOSE_KEYS, keyHints, LATEST } from "./words.ts";

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
  /** Told the level in front each time the screen is drawn again, for a test that waits until one is. */
  onDraw?: (screen: Screen) => void;
  /** The name of this machine, which the foot of the agents and rooms says beside the person's. */
  machine?: string;
}

export interface Drawing {
  /** Resolves when the person has asked to leave. */
  readonly left: Promise<void>;
  /** Leave as if the person had asked to. */
  leave(): void;
  /** The screen as the terminal shows it now, a line to a row. */
  render(): string[];
  /** Give the terminal back, with the open thread printed back on it. */
  stop(): Promise<void>;
}

/** How often what moves moves: the shrimp walks, the lanterns pulse and the tide runs. */
const TICK_MS = 180;
/** How long the terminal is given to say what its background is. */
const COLORS_MS = 400;

/**
 * Draw the console on the terminal's whole screen and carry what the person
 * types to the state. The levels stand side by side as the width allows, the
 * keys are in one of them, and going back is the console's own: Right and
 * Enter open what is chosen, Left goes back, through what is typed first in a
 * thread, and Tab is the other view of where the keys are. Everything is drawn
 * again from the state's model after each change, and the screen scrolls,
 * selects and searches as pi-tui's whole screen does.
 */
export function startDrawing(options: DrawingOptions): Drawing {
  // A link in a message would show its text and hide where it goes. With this the address is printed with it.
  setCapabilityOverrides({ hyperlinks: false });

  const { state } = options;
  const now = options.now ?? Date.now;
  const terminal = options.terminal ?? new ProcessTerminal();
  const trueColor = getTerminalColorMode() === "truecolor";
  const inFull = { toolCalls: false, thinking: false };
  const frame: Frame = {
    // Where the terminal has true color its ground is dusk until it says its background is light.
    paint: createPaint(trueColor ? "dusk" : "own"),
    tick: 0,
    height: () => Math.max(1, tui.terminal.rows - 1),
    width: () => Math.max(1, tui.terminal.columns),
    folded: false,
    front: "agents",
    model: state.model(),
    levels: levelsOf(state.model(), { now: now(), inFull, filter: "everything" }),
    filter: "everything",
    inFull,
    chosen: { agents: undefined, list: undefined },
    running: new Set(),
    machine: options.machine,
  };
  const tui = new TuiAltScreen(terminal, false, undefined, {
    scrollToEndIndicator: () => frame.paint.text(` ${LATEST} `, { tone: "ink", on: "raise" }),
  });

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

  const editorTheme: EditorTheme = {
    borderColor: (text) => frame.paint.text(text, "line2"),
    selectList: {
      selectedPrefix: (text) => frame.paint.text(text, "coral"),
      selectedText: (text) => frame.paint.text(text, "coral"),
      description: (text) => frame.paint.text(text, "ink3"),
      scrollInfo: (text) => frame.paint.text(text, "ink3"),
      noMatch: (text) => frame.paint.text(text, "ink3"),
    },
  };
  const editor = new Editor(tui, editorTheme, { paddingX: 1 });

  // What was typed in each thread that is not open, so that opening another thread doesn't lose or misplace it.
  const drafts = new Map<string, string>();
  let draftKey: string | undefined;
  const syncDraft = (open: Open): void => {
    const key = draftKeyOf(open);
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

  // The screen as it was last drawn, which says what the keys do in front.
  let current: Screen = screenOf(frame);
  // While what is typed in a thread starts with a slash, the editor lists the commands that can be written there, and the models of the agent after `/model `.
  editor.setAutocompleteProvider(
    commandList({
      commands: () => frame.levels.thread?.commands ?? [],
      async models() {
        const model = state.model();
        const { item } = model.open;
        if (item?.kind !== "thread" || item.place.kind !== "agent") return undefined;
        const models = await state.models();
        return models === undefined ? undefined : modelLines(models, agentNameOf(model, item.place.id));
      },
    }),
  );

  /** Put `level` in front, and draw it. */
  function go(level: Level): void {
    frame.front = level;
    update();
  }
  const focusItem = (): void => {
    if (frame.model.open.item !== undefined) go("item");
  };

  /** Open what a row is: an agent's list or a room's, or a thread or a session in the open list. */
  function open(row: Row): void {
    if (row.kind === "agent" || row.kind === "room" || row.kind === "read-only") {
      frame.chosen.agents = rowKey(row);
      if (row.kind === "agent") state.selectAgent(row.id);
      else if (row.kind === "room") state.selectRoom(row.id);
      else state.selectReadOnly(row.id);
      go("list");
      return;
    }
    frame.chosen.list = rowKey(row);
    landing = false;
    if (row.kind === "session") state.openSession(row.id);
    else state.openThread(row.id);
    go("item");
  }

  const setFilter = (filter: ListFilter): void => {
    frame.filter = filter;
    go("list");
  };

  const prose = new Prose();
  const rail = new Pane(frame, "ground", (width, height) => drawRail(frame, width, height, notesFor(frame, "agents"), open), () => go("agents"));
  const list = new Pane(
    frame,
    "list",
    (width, height) => drawList(frame, width, height, notesFor(frame, "list"), { open, filter: setFilter }),
    () => {
      if (frame.model.open.list !== undefined) go("list");
    },
  );
  const header = new ThreadHeader(frame, () => state.turnOver(), focusItem);
  const dock = new Dock(frame);
  const cursor = renderFakeCursor("\u0000");
  const [cursorStart = "", cursorEnd = ""] = cursor.split("\u0000");
  const input = new Input(frame, editor, focusItem, { start: cursorStart, end: cursorEnd });
  const conversation = new Conversation(frame, prose, (width) => header.render(width).length + dock.render(width).length + input.render(width).length);
  const scroll = new ScrollView(conversation, { follow: "end", primary: true });
  const thread = new VStack([{ component: header }, { component: scroll, basis: 0, grow: 1, minSize: 1 }, { component: dock }, { component: input }]);
  const divider = (): Component => ({
    render: () => Array.from({ length: frame.height() }, () => frame.paint.lay(frame.paint.text("│", "line"), 1, "ground")),
    invalidate() {},
  });
  // A width that changes can put another level on show, which changes whether the person is looking at the thread.
  let drawnWidth = 0;
  const watchWidth: Component = {
    render(width) {
      if (width !== drawnWidth) {
        drawnWidth = width;
        queueMicrotask(update);
      }
      return [];
    },
    invalidate() {},
  };
  const keysLine = new KeysLine(frame, () => {
    if (waitingForSecondPress) return "quit-again";
    if (keys !== undefined) return [CLOSE_KEYS];
    return keyHints({ send: current.can.send, choose: current.can.choose, back: current.can.back, first: frame.front === "agents" });
  });
  const levelsShown = (count: 1 | 2 | 3) => (viewport: { width: number }) => levelsAt(viewport.width, frame.folded) === count;
  tui.setLayoutRoot(
    new VStack([
      { component: watchWidth, basis: 0, shrink: 0 },
      {
        component: new HStack([
          { component: rail, basis: 0, grow: 1, visible: () => frame.front === "agents" },
          { component: list, basis: 0, grow: 1, visible: () => frame.front === "list" },
          { component: thread, basis: 0, grow: 1, visible: () => frame.front === "item" },
        ]),
        basis: 0,
        grow: 1,
        visible: levelsShown(1),
      },
      {
        component: new HStack([
          { component: rail, basis: LIST, shrink: 0, visible: () => frame.front === "agents" },
          { component: list, basis: LIST, shrink: 0, visible: () => frame.front !== "agents" },
          { component: divider(), basis: 1, shrink: 0 },
          { component: thread, basis: 0, grow: 1 },
        ]),
        basis: 0,
        grow: 1,
        visible: levelsShown(2),
      },
      {
        component: new HStack([
          { component: rail, basis: RAIL, shrink: 0 },
          { component: divider(), basis: 1, shrink: 0 },
          { component: list, basis: LIST, shrink: 0 },
          { component: divider(), basis: 1, shrink: 0 },
          { component: thread, basis: 0, grow: 1 },
        ]),
        basis: 0,
        grow: 1,
        visible: levelsShown(3),
      },
      { component: keysLine, basis: 1, shrink: 0 },
    ]),
  );

  // The list of every key, while it is open.
  let keys: OverlayHandle | undefined;
  const keysList = new KeysList(frame, () => closeKeys());
  const openKeys = (): void => {
    keys = tui.showOverlay(keysList, { width: Math.min(KEYS_WIDTH, Math.max(1, frame.width() - 4)), anchor: "center", nonCapturing: true });
    update();
  };
  const closeKeys = (): void => {
    keys?.hide();
    keys = undefined;
    update();
  };

  // What moves, moves only while something works, so that a screen at rest is not drawn again for nothing.
  let ticker: ReturnType<typeof setInterval> | undefined;
  const animate = (moving: boolean): void => {
    if (moving && ticker === undefined) {
      ticker = setInterval(() => {
        frame.tick += 1;
        tui.requestRender();
      }, TICK_MS);
    } else if (!moving && ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };

  // What was open when the screen was last drawn, so that what the state opens, as it opens the only agent's list, is put in front.
  let listOpen: string | undefined;
  let itemOpen: Item | undefined;
  // An agent's list that is opened starts on the row where the agent is working, once it has said which sessions it has.
  let landing = false;
  let focused: Component | null | undefined;
  let title: string | undefined;
  let shown: string | undefined;

  function update(): void {
    const model = state.model();
    frame.model = model;
    const { list: openList, item } = model.open;
    const listKey = openList === undefined ? undefined : listRowKey(openList);
    if (listKey !== listOpen) {
      if (listOpen === undefined && listKey !== undefined) frame.front = item === undefined ? "list" : "item";
      if (listKey !== undefined) frame.chosen.agents = listKey;
      frame.chosen.list = undefined;
      landing = openList?.kind === "agent";
    }
    if (opened(itemOpen, item)) frame.front = "item";
    listOpen = listKey;
    itemOpen = item;
    if (openList === undefined) frame.front = "agents";
    else if (item === undefined && frame.front === "item") frame.front = "list";

    frame.running = runningIn(model);
    frame.levels = levelsOf(model, { now: now(), inFull, filter: frame.filter });
    const { agents, list: listLevel, thread: threadLevel, session } = frame.levels;
    frame.chosen.agents = kept(agents.rows, frame.chosen.agents);
    const rows = listLevel === undefined ? [] : listRows(listLevel);
    frame.chosen.list ??= openedKey(item);
    if (landing && listLevel?.settled === true && rows.length > 0) {
      landing = false;
      const busy = rows.find((each) => each.working);
      if (busy !== undefined) frame.chosen.list = rowKey(busy);
    }
    frame.chosen.list = kept(rows, frame.chosen.list);

    // The person is looking at a thread while it is on show, whichever view of it is.
    state.look(item?.kind === "thread" && onShow(frame.width(), frame.folded, frame.front).includes("item"));
    // Another thread, or another view of one, opens at its end, where what is new is.
    const showing = item === undefined ? undefined : JSON.stringify(item);
    if (showing !== shown) {
      shown = showing;
      scroll.scrollToEnd();
    }
    syncDraft(model.open);
    const next = frame.front === "item" && writable(frame) && keys === undefined ? editor : null;
    if (focused !== next) {
      focused = next;
      tui.setFocus(next);
    }
    const working = agents.rows.filter((each) => each.kind === "agent" && each.working).length;
    animate(working > 0 || threadLevel?.working !== undefined || session?.working !== undefined);
    const named = windowTitle(working, agents.unread);
    if (named !== title) {
      title = named;
      terminal.setTitle(named);
    }
    current = screenOf(frame);
    tui.requestRender();
    options.onDraw?.(current);
  }

  /** The rows of the list the keys are in, as they are drawn, and which of them is chosen. */
  function inFront(): { rows: Row[]; chosen: string | undefined } {
    if (frame.front === "agents") return { rows: frame.levels.agents.rows, chosen: frame.chosen.agents };
    return { rows: frame.levels.list === undefined ? [] : listRows(frame.levels.list), chosen: frame.chosen.list };
  }

  /** Move the chosen row of the list the keys are in by `by`. */
  function choose(by: number): void {
    const { rows, chosen } = inFront();
    const at = Math.max(0, rows.findIndex((each) => rowKey(each) === chosen));
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + by))];
    if (next === undefined) return;
    if (frame.front === "agents") frame.chosen.agents = rowKey(next);
    else frame.chosen.list = rowKey(next);
    landing = false;
    update();
  }

  /** What a key does where the keys are in a list. */
  function onList(data: string): void {
    if (matchesKey(data, "up") || matchesKey(data, "down")) choose(matchesKey(data, "up") ? -1 : 1);
    else if (matchesKey(data, "right") || matchesKey(data, "enter")) {
      const { rows, chosen } = inFront();
      const row = rows.find((each) => rowKey(each) === chosen);
      if (row !== undefined) open(row);
    } else if (matchesKey(data, "left") && frame.front === "list") go("agents");
    else if (matchesKey(data, "tab") && frame.front === "list" && frame.levels.list?.ofAgent === true) {
      setFilter(frame.filter === "everything" ? "yours" : "everything");
    }
  }

  tui.addInputListener((data) => {
    // A terminal that reports keys being let go sends one more event for each press, and a key is pressed once.
    if (isKeyRelease(data)) return undefined;
    // The other overlay is pi-tui's search of the thread, whose keys are its own until Esc closes it.
    if (keys === undefined && tui.hasOverlay()) return undefined;
    if (keys !== undefined) {
      if (matchesKey(data, "escape") || matchesKey(data, "ctrl+g") || matchesKey(data, "left")) closeKeys();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+c")) {
      // What is typed is only there to clear where there is an input to see it in.
      const pressed = quitting.press(writable(frame) && editor.getText() !== "");
      if (pressed === "cleared") editor.setText("");
      if (pressed === "quit") leave();
      update();
      return { consume: true };
    }
    quitting.other();
    if (matchesKey(data, "ctrl+g")) {
      openKeys();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+d")) {
      if (editor.getText() === "") leave();
      // With something typed, Ctrl+D is the editor's, where the keys are in it.
      return editor.getText() !== "" && frame.front === "item" ? undefined : { consume: true };
    }
    if (matchesKey(data, "ctrl+\\")) {
      frame.folded = !frame.folded;
      update();
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+n")) {
      if (frame.levels.list?.startable === true) {
        state.startThread();
        go("item");
      }
      return { consume: true };
    }
    if (matchesKey(data, "ctrl+o") || matchesKey(data, "ctrl+t")) {
      if (matchesKey(data, "ctrl+o")) inFull.toolCalls = !inFull.toolCalls;
      else inFull.thinking = !inFull.thinking;
      update();
      return { consume: true };
    }
    // Esc closes the list of commands, which the editor does, and does nothing else.
    if (matchesKey(data, "escape")) return editor.isShowingAutocomplete() ? undefined : { consume: true };
    if (frame.front !== "item") {
      onList(data);
      return { consume: true };
    }
    if (matchesKey(data, "tab")) {
      // While the editor lists commands, Tab is the editor's: it puts the chosen command in the input.
      if (editor.isShowingAutocomplete()) return undefined;
      state.turnOver();
      return { consume: true };
    }
    if (matchesKey(data, "left")) {
      // Left crosses what is typed first, and goes back from its start.
      const { line, col } = editor.getCursor();
      if (writable(frame) && (line > 0 || col > 0)) return undefined;
      go("list");
      return { consume: true };
    }
    return undefined;
  });

  const unsubscribe = state.subscribe(update);
  update();
  tui.start();
  if (trueColor) {
    void tui.queryTerminalColors({ timeoutMs: COLORS_MS }).then((colors) => {
      const wool = colors.background !== undefined && isLight(colors.background) ? "day" : "dusk";
      if (wool === frame.paint.wool) return;
      frame.paint = createPaint(wool);
      tui.invalidate();
      tui.requestRender(true);
    });
  }

  let stopped = false;
  return {
    left,
    leave: () => leave(),
    render() {
      tui.renderNow();
      return tui.getScreenLines();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      animate(false);
      quitting.close();
      keys?.hide();
      // Leaving prints the open thread back where the console was, as what was said, with no ground under it.
      tui.setLayoutRoot({
        render: (width) => {
          const shown = frame.model.open.item === undefined ? [] : conversation.said(width);
          const named = frame.levels.session?.title ?? frame.levels.thread?.title;
          return named === undefined ? shown : [frame.paint.runs([[` ${named}`, { tone: "ink", bold: true }]]), ...shown];
        },
        invalidate() {},
      });
      tui.stop();
      await terminal.drainInput(250, 25);
    },
  };
}

/** `chosen` if it is still one of `rows`, and else the first of them. */
const kept = (rows: readonly Row[], chosen: string | undefined): string | undefined =>
  rows.some((each) => rowKey(each) === chosen) ? chosen : rows[0] === undefined ? undefined : rowKey(rows[0]);

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

