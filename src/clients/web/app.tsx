/*
 * The page: the three levels laid out for the width it has, the address that
 * follows what is open, and the keys. It reads the views and calls the
 * state's moves, and holds only what a page has: which level is in front, the
 * tab and the file open, what is folded, what is shown in full, the time of
 * day, and what is typed.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { compareShrimpy, linksWith } from "../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { type Mode, WOOLS } from "../look/index.ts";
import type { LinkStatus } from "../network/index.ts";
import { agentEntries, agentNameOf, type ClientState, type Model, type Place, placeOfThread, sidesOf } from "../state/index.ts";
import {
  agentsLevel,
  browserLabel,
  type InFull,
  type ListFilter,
  listLevel,
  modelLines,
  nextTry,
  nothingOpen,
  PICK_FILE,
  type Row,
  sessionLevel,
  threadLevel,
  windowTitle,
  writeTo,
} from "../view/index.ts";
import { addressOf, type Route, routeOf, type Tab } from "./address.ts";
import { ListView } from "./list.tsx";
import { Rail } from "./rail.tsx";
import { FileView, HomeTree, TriggerCards } from "./home.tsx";
import { Glyph } from "./marks.tsx";
import { setCount } from "./badge.ts";
import { askPush, onTapped, type Push, startPush } from "./push.ts";
import { Empty, ReloadOffer, SessionView, ThreadView } from "./thread.tsx";
import { WatchView } from "./watch.tsx";
import { CONTROLS, FOLD, keyHints, NEW_THREAD_KEY, pageOutOfDate, SELF, UNFOLD } from "./words.ts";

/** When the page next tries to reach the gateway, as the pauses it gives the link say. */
export interface Retry {
  /** The moment of the next try, in milliseconds since the epoch, or undefined while none waits. */
  at(): number | undefined;
  subscribe(listener: () => void): () => void;
}

/** What only the page holds. */
interface PageState {
  /** Which level is in front: agents and rooms, the open list, or what is open in it. */
  level: 1 | 2 | 3;
  tab: Tab;
  /** The file of the agent's home open in the thread's place, by its path there. */
  file: string | undefined;
  filter: ListFilter;
  inFull: InFull;
  /** Every wake-up of the thread is on show, not only the soonest. */
  later: boolean;
  /** The agent whose work is open where several work in a thread. */
  work: string | undefined;
}

/** What the person chose last on this device, kept for the next time the page opens. */
function kept<T extends string>(name: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(`shrimpy-${name}`);
    return allowed.find((each) => each === value) ?? fallback;
  } catch {
    return fallback;
  }
}

function keep(name: string, value: string): void {
  try {
    localStorage.setItem(`shrimpy-${name}`, value);
  } catch {
    // A browser that keeps nothing for the page forgets the choice when it closes.
  }
}

/** Where the page keeps what the gateway ran when it turned the page away and the page reloaded for it, for the tab's life. */
const RELOADED_FOR = "shrimpy-reloaded-for";

/**
 * Reload the page when the gateway turns it away for the release it runs,
 * since the gateway serves the page of its own release. A gateway that turns
 * the reloaded page away too is not reloaded for again until it lets the page
 * in, so a refusal a reload doesn't fix can't loop.
 */
function useReloadForRelease(gateway: LinkStatus): void {
  useEffect(() => {
    try {
      if (gateway.state === "up") return sessionStorage.removeItem(RELOADED_FOR);
      if (gateway.why.kind !== "refused" || linksWith(gateway.why.versions)) return;
      const theirs = JSON.stringify(gateway.why.versions);
      if (sessionStorage.getItem(RELOADED_FOR) === theirs) return;
      sessionStorage.setItem(RELOADED_FOR, theirs);
    } catch {
      // A browser that keeps nothing for the page could reload without end, so it shows the refusal instead.
      return;
    }
    location.reload();
  }, [gateway]);
}

/**
 * The state's model, drawn again at each change. What changed between the
 * first drawing and listening, as the link coming up while the page is first
 * drawn does, is taken when listening starts.
 */
function useModel(state: ClientState): Model {
  const [model, setModel] = useState(() => state.model());
  useEffect(() => {
    setModel(state.model());
    return state.subscribe(setModel);
  }, [state]);
  return model;
}

/** The moment it is, a new one each second while `often`, and each half minute otherwise. */
function useNow(often: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), often ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [often]);
  return now;
}

/** How wide the element `ref` holds is, as it changes. */
function useWidth(ref: { readonly current: HTMLElement | null }): number {
  const [width, setWidth] = useState(innerWidth);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const seen = new ResizeObserver(() => setWidth(element.clientWidth));
    seen.observe(element);
    return () => seen.disconnect();
  }, [ref]);
  return width;
}

/** Whether the page is on show, as the browser says. */
function useVisible(): boolean {
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const seen = (): void => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);
  return visible;
}

const samePlace = (a: Place | undefined, b: Place | undefined): boolean => a?.kind === b?.kind && a?.id === b?.id;

/** Where the page is, from what the state has open and the level in front. */
function routeNow(model: Model, page: PageState): Route {
  const { list, item } = model.open;
  if (page.level === 1 || list === undefined) return { kind: "agents" };
  if (page.level === 3 && page.file !== undefined && list.kind === "agent") return { kind: "list", list, tab: "home", shown: { kind: "file", path: page.file } };
  if (page.level === 2 || item === undefined) return { kind: "list", list, tab: page.tab, shown: undefined };
  if (item.kind === "session") return { kind: "list", list, tab: page.tab, shown: { kind: "session", session: item.session } };
  return { kind: "list", list, tab: page.tab, shown: { kind: "thread", thread: item.thread, view: item.side !== undefined } };
}

/** The file a route opens, if it opens one. */
const fileOf = (route: Route): string | undefined => (route.kind === "list" && route.shown?.kind === "file" ? route.shown.path : undefined);

/** The level a route puts in front. */
function levelOf(route: Route): PageState["level"] {
  if (route.kind === "agents") return 1;
  if (route.kind === "thread") return 3;
  return route.shown === undefined ? 2 : 3;
}

/** The route one level up from `route`: from the agent's view to the conversation, from a thread to its list, from a list to agents and rooms. */
function upFrom(route: Route): Route {
  if (route.kind !== "list") return { kind: "agents" };
  const { shown } = route;
  if (shown === undefined) return { kind: "agents" };
  if (shown.kind === "thread" && shown.view) return { ...route, shown: { ...shown, view: false } };
  return { ...route, shown: undefined };
}

/** How many of a tool's last lines a brief call shows beside a thread. */
const OUTPUT_LINES = 2;

/** How long a route to a thread waits to learn which channel the thread is in, before it is opened all the same. */
const WAIT_MS = 8000;

/** What the address names, waiting to be opened, and whether it may still wait to learn where its thread is. */
interface Pending {
  route: Route;
  patient: boolean;
}

/** Whether a row of that kind opens a list: an agent's, a room's, or a channel's only read. */
const opensList = (kind: Row["kind"]): kind is Place["kind"] => kind === "agent" || kind === "room" || kind === "read-only";

/** The member IDs of the agents that are running. */
const runningOf = (model: Model): Set<string> => new Set(agentEntries(model).flatMap((entry) => (entry.running ? [entry.id] : [])));

export function App({ state, retry, refusal }: { state: ClientState; retry: Retry; refusal: string | undefined }) {
  const model = useModel(state);
  useReloadForRelease(model.gateway);
  const [page, setPage] = useState<PageState>(() => {
    const route = routeOf(location.pathname);
    return {
      level: levelOf(route),
      tab: route.kind === "list" ? route.tab : "threads",
      file: fileOf(route),
      filter: "everything",
      inFull: { toolCalls: false, thinking: false },
      later: false,
      work: undefined,
    };
  });
  const [mode, setMode] = useState<Mode>(() => kept("mode", matchMedia("(prefers-color-scheme: light)").matches ? "day" : "dusk", ["dusk", "day"]));
  // The two lists folded into a strip of sigils, and brought back over the thread for a moment.
  const [fold, setFold] = useState(() => kept("fold", "open", ["open", "folded"]) === "folded");
  const [peek, setPeek] = useState(false);
  const [nextAt, setNextAt] = useState(retry.at());
  useEffect(() => {
    setNextAt(retry.at());
    return retry.subscribe(() => setNextAt(retry.at()));
  }, [retry]);
  const visible = useVisible();
  const [push, setPush] = useState<Push>("none");
  useEffect(() => {
    void startPush().then(setPush);
  }, []);
  const stale = model.gateway.state === "down" && model.listing !== undefined;
  const now = useNow(stale);
  const drafts = useRef(new Map<string, string>()).current;
  const app = useRef<HTMLDivElement>(null);

  // What the address names, until the state has it open: the address the page was opened at, or went Back or Forward
  // to, which may wait a while to learn where a thread is, or what the person chose, which never waits.
  const [pending, setPending] = useState<Pending | undefined>(() => ({ route: routeOf(location.pathname), patient: true }));
  // The next change of address is one the person made, which Back undoes.
  const pushing = useRef(false);

  /** Open what `route` names, a list and what is shown in it, as far as the state can yet: true once it has. */
  const settle = (route: Extract<Route, { kind: "list" }>, waited: boolean): boolean => {
    const { list, shown } = route;
    // A thread from an agent's list is opened once its channel is known, so that it is opened in the channel it is in.
    if (shown?.kind === "thread" && shown.thread !== undefined && list.kind === "agent" && placeOfThread(state.model(), shown.thread) === undefined && !waited) {
      return false;
    }
    if (!samePlace(state.model().open.list, list)) {
      if (list.kind === "agent") state.selectAgent(list.id);
      else if (list.kind === "room") state.selectRoom(list.id);
      else state.selectReadOnly(list.id);
    }
    const { item } = state.model().open;
    if (shown?.kind === "session") {
      if (item?.kind !== "session" || item.session !== shown.session) state.openSession(shown.session);
      return true;
    }
    if (shown?.kind !== "thread") return true;
    if (shown.thread === undefined) {
      if (item?.kind !== "thread" || item.thread !== undefined) state.startThread();
      return true;
    }
    if (item?.kind !== "thread" || item.thread !== shown.thread) state.openThread(shown.thread);
    const side = (): boolean => {
      const open = state.model().open.item;
      return open?.kind === "thread" && open.side !== undefined;
    };
    if (side() === shown.view) return true;
    // The conversation comes back at once, as the thread opened afresh. An agent's view is on show once an agent has a
    // session behind the thread to show, the agent whose list it is first.
    if (!shown.view) state.openThread(shown.thread);
    else if (sidesOf(state.model()).length > 0) state.turnOver();
    return side() === shown.view || waited;
  };

  // A route that may wait waits a while, and is then opened all the same.
  useEffect(() => {
    if (pending?.patient !== true) return;
    const timer = setTimeout(() => setPending((now) => (now === pending ? { ...now, patient: false } : now)), WAIT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // What the address names is opened each time the model changes, once the state knows enough to open it.
  useEffect(() => {
    if (pending === undefined) return;
    const { route, patient } = pending;
    if (route.kind === "thread") {
      // A thread by its ID alone is opened in its list, once chat says which channel it is in.
      const list = placeOfThread(state.model(), route.thread);
      if (list === undefined && patient) return;
      if (list === undefined) setPage((before) => ({ ...before, level: 1 }));
      else if (!settle({ kind: "list", list, tab: "threads", shown: { kind: "thread", thread: route.thread, view: false } }, !patient)) return;
    } else if (route.kind === "list" && !settle(route, !patient)) {
      return;
    }
    setPending(undefined);
  });

  // Back and Forward go where the address says.
  useEffect(() => {
    const popped = (): void => {
      const route = routeOf(location.pathname);
      setPending({ route, patient: true });
      setPage((before) => ({ ...before, level: levelOf(route), tab: route.kind === "list" ? route.tab : before.tab, file: fileOf(route) }));
    };
    addEventListener("popstate", popped);
    return () => removeEventListener("popstate", popped);
  }, []);

  // The level in front follows what the state opens by itself, as it opens the only agent's list, while nothing waits to be opened.
  const listOpen = useRef(model.open.list !== undefined);
  useEffect(() => {
    const open = model.open.list !== undefined;
    if (open && !listOpen.current && pending === undefined && page.level === 1) setPage((before) => ({ ...before, level: 2 }));
    listOpen.current = open;
  });

  // The address follows what is open: a change the person made is one Back undoes, and any other takes the address's place.
  useEffect(() => {
    if (pending !== undefined) return;
    const address = addressOf(routeNow(state.model(), page));
    const push = pushing.current;
    pushing.current = false;
    if (address === location.pathname) return;
    if (push) history.pushState({ up: location.pathname }, "", address);
    else history.replaceState(history.state, "", address);
  });

  // A notification tapped while the page is open opens its thread here.
  const tapped = useRef<(thread: string) => void>(() => undefined);
  useEffect(() => onTapped((thread) => tapped.current(thread)), []);

  // The person is looking at a thread while it is in front and the page is on show.
  const looking = visible && page.level === 3 && page.file === undefined && model.open.item?.kind === "thread";
  useEffect(() => state.look(looking), [state, looking]);

  useLayoutEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", WOOLS[mode].pane);
  }, [mode]);

  /** Go to `route` as the person asked: open what it names, and let Back undo it. */
  const go = (route: Route): void => {
    pushing.current = true;
    setPending({ route, patient: false });
    setPage((before) => ({ ...before, level: levelOf(route), tab: route.kind === "list" ? route.tab : before.tab, file: fileOf(route), later: false, work: undefined }));
  };

  /** Go up a level: Back, when the page came from there. */
  const back = (): void => {
    const up = upFrom(routeNow(state.model(), page));
    const address = addressOf(up);
    if ((history.state as { up?: string } | null)?.up === address) return history.back();
    setPending({ route: up, patient: false });
    setPage((before) => ({ ...before, level: levelOf(up), file: fileOf(up), later: false }));
  };

  const list = model.open.list;
  const item = model.open.item;
  const startThread = (): void => {
    const place = page.level === 3 && item?.kind === "thread" ? item.place : list;
    if (place === undefined || place.kind === "read-only") return;
    go({ kind: "list", list: list ?? place, tab: "threads", shown: { kind: "thread", thread: undefined, view: false } });
    state.startThread(place);
  };

  const at = { now, self: SELF };
  const agents = agentsLevel(model, at);
  tapped.current = (thread) => go({ kind: "thread", thread });
  useEffect(() => void setCount(navigator, agents.unread).catch(() => undefined), [agents.unread]);
  const workingAgents = agents.rows.filter((row) => row.kind === "agent" && row.working).length;
  useEffect(() => {
    document.title = windowTitle(workingAgents, agents.unread);
  }, [workingAgents, agents.unread]);
  const listView = page.level >= 2 ? listLevel(model, { ...at, filter: page.filter }) : undefined;
  const file = page.level === 3 && list?.kind === "agent" ? page.file : undefined;
  const front = page.level === 3 && file === undefined;
  const thread = front ? threadLevel(model, { ...at, inFull: page.inFull, outputLines: OUTPUT_LINES }) : undefined;
  const session = front && item?.kind === "session" ? sessionLevel(model, { ...at, inFull: { toolCalls: true, thinking: true } }) : undefined;
  const running = useMemo(() => runningOf(model), [model]);
  const listAgent = list?.kind === "agent" ? list.id : undefined;
  const retryLine = stale && nextAt !== undefined && nextAt > now ? nextTry(Math.ceil((nextAt - now) / 1000)) : undefined;

  const turnable = thread?.turnable === true;
  const turned = front && item?.kind === "thread" && item.side !== undefined;
  const watching = turned ? sessionLevel(model, { ...at, inFull: { toolCalls: true, thinking: true } }) : undefined;

  // Each level says what is not working on it, and the page shows a note once, in the first pane on screen that has
  // it: the rail, the list, then the thread and the agent's view beside it. On a phone each level is on its own.
  const width = useWidth(app);
  const layout = width < 720 ? "phone" : width < 1100 ? "tablet" : "desk";
  const railShown = layout === "desk" ? !fold || peek : page.level === 1 && (!fold || peek || layout === "phone");
  const listShown = layout === "desk" ? !fold || peek : layout === "tablet" ? (fold ? peek : page.level >= 2) : page.level === 2;
  // The gateway serves the page of its own release, so one newer than the page is taken by reloading, on any level.
  const gatewayRuns = model.listing?.versions?.shrimpy;
  const outOfDate = gatewayRuns !== undefined && (compareShrimpy(gatewayRuns, SHRIMPY_VERSION) ?? 0) > 0 ? pageOutOfDate(gatewayRuns) : undefined;
  const everywhere = (notes: string[]): string[] => (outOfDate === undefined ? notes : [outOfDate, ...notes]);
  const railNotes = everywhere([...(refusal === undefined ? [] : [refusal]), ...agents.notes]);
  const listRaw = everywhere(listView?.notes ?? []);
  const shownAbove = new Set([...(railShown ? railNotes : []), ...(listShown ? listRaw : [])]);
  const unsaid = (notes: string[], said: ReadonlySet<string>): string[] => notes.filter((note) => !said.has(note));
  const listNotes = unsaid(listRaw, railShown ? new Set(railNotes) : new Set());
  const threadNotes = unsaid(everywhere(thread?.notes ?? session?.notes ?? []), shownAbove);
  const watchNotes = unsaid(everywhere(watching?.notes ?? []), new Set([...shownAbove, ...threadNotes]));

  /** Put the next agent's view of the thread beside it, or over it on a phone, and after the last take it away. */
  const turn = (): void => {
    if (!front || item?.kind !== "thread" || list === undefined) return;
    if (!turned) {
      if (turnable) go({ kind: "list", list, tab: page.tab, shown: { kind: "thread", thread: item.thread, view: true } });
      return;
    }
    const sides = sidesOf(model);
    // After the last agent's view comes the conversation, which is where the views were opened from.
    if (item.side === sides.at(-1)) back();
    else state.turnOver();
  };

  const toggleFold = (): void => {
    setFold((before) => {
      keep("fold", before ? "open" : "folded");
      return !before;
    });
    setPeek(false);
  };

  // Folded, the lists come back over the thread while the pointer or the focus is on them, or at a tap on the strip.
  const over = useRef(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peekIn = (on: boolean, wait: number): void => {
    clearTimeout(peekTimer.current);
    if (fold) peekTimer.current = setTimeout(() => setPeek(on), wait);
  };
  const lists = useRef<HTMLDivElement>(null);
  const peeking = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      over.current = true;
      peekIn(true, 90);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      over.current = false;
      peekIn(false, 320);
    },
    onFocusIn: () => peekIn(true, 0),
    onFocusOut: (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      const inLists = [...(lists.current?.querySelectorAll(".rail, .list") ?? [])].some((pane) => next !== null && pane.contains(next));
      if (!over.current && !inLists) peekIn(false, 0);
    },
  };

  // The keys: Esc goes back a level, Ctrl+N starts a thread, Ctrl+. puts the agent's view beside the thread or over it,
  // and Ctrl+\ folds the lists.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keys.current = (event) => {
    if (event.key === "Escape" && fold && peek) {
      event.preventDefault();
      setPeek(false);
    } else if (event.key === "Escape" && page.level > 1) {
      event.preventDefault();
      back();
    } else if (event.ctrlKey && event.key === "n" && (thread?.writable ?? listView?.startable === true)) {
      event.preventDefault();
      startThread();
    } else if (event.ctrlKey && event.key === ".") {
      event.preventDefault();
      turn();
    } else if (event.ctrlKey && event.key === "\\") {
      event.preventDefault();
      toggleFold();
    }
  };
  useEffect(() => {
    const pressed = (event: KeyboardEvent): void => keys.current(event);
    document.addEventListener("keydown", pressed);
    return () => document.removeEventListener("keydown", pressed);
  }, []);

  // What is said in a thread scrolls to its newest unless the person has scrolled up to read.
  useLayoutEffect(() => {
    for (const scroll of app.current?.querySelectorAll<HTMLElement>('[data-follow="end"]') ?? []) {
      const near = scroll.dataset.near !== "false";
      if (near) scroll.scrollTop = scroll.scrollHeight;
    }
  });
  useEffect(() => {
    const seen = (event: Event): void => {
      const scroll = event.target as HTMLElement;
      if (scroll.dataset.follow === "end") scroll.dataset.near = String(scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48);
    };
    const root = app.current;
    root?.addEventListener("scroll", seen, true);
    return () => root?.removeEventListener("scroll", seen, true);
  }, []);

  const choose = (row: Row): void => {
    const { kind } = row;
    // A list chosen from the strip stays over the thread, for a thread to be chosen from it.
    setPeek(fold && opensList(kind));
    if (opensList(kind)) go({ kind: "list", list: { kind, id: row.id }, tab: "threads", shown: undefined });
    else if (list !== undefined && row.kind === "session") go({ kind: "list", list, tab: page.tab, shown: { kind: "session", session: row.id } });
    else if (list !== undefined) {
      go({ kind: "list", list, tab: page.tab, shown: { kind: "thread", thread: row.id, view: false } });
      // A thread opened again opens afresh, with its conversation on show.
      if (item?.kind === "thread" && item.thread === row.id) state.openThread(row.id);
    }
  };

  const dmAgent = item?.kind === "thread" && item.place.kind === "agent" ? item.place.id : undefined;
  const models = useMemo(
    () =>
      dmAgent === undefined
        ? undefined
        : async () => {
            const found = await state.models();
            return found === undefined ? undefined : modelLines(found, agentNameOf(state.model(), dmAgent));
          },
    [state, dmAgent],
  );

  const openFile = (path: string): void => {
    if (list?.kind === "agent") go({ kind: "list", list, tab: "home", shown: { kind: "file", path } });
  };

  let pane;
  if (file !== undefined && listView !== undefined) {
    pane = <FileView key={`${listAgent ?? ""}\n${file}`} state={state} name={listView.name} look={listView.look} path={file} back={back} />;
  } else if (front && item?.kind === "thread" && thread !== undefined) {
    const draftKey = `${JSON.stringify(item.place)}\n${item.thread ?? "new"}`;
    pane = (
      <ThreadView
        key={draftKey}
        thread={{ ...thread, notes: threadNotes }}
        dm={item.place.kind === "agent"}
        stale={model.chat.state === "down"}
        turned={turned}
        retry={retryLine}
        inFull={page.inFull}
        work={page.work}
        later={page.later}
        placeholder={writeTo(thread.who)}
        composer={{
          drafts,
          draftKey,
          models,
          submit: (text) => state.write(text),
          keys: keyHints({ newThread: thread.writable, turnOver: turnable }),
        }}
        back={back}
        turn={turn}
        join={() => void state.joinRoom()}
        toggleFull={(which) => setPage((before) => ({ ...before, inFull: { ...before.inFull, [which]: !before.inFull[which] } }))}
        toggleLater={() => setPage((before) => ({ ...before, later: !before.later }))}
        openWork={(agent) => setPage((before) => ({ ...before, work: agent }))}
      />
    );
  } else if (session !== undefined) {
    pane = <SessionView session={{ ...session, notes: threadNotes }} back={back} retry={retryLine} />;
  } else {
    // Nothing is open in the thread's place, whatever the state still holds open behind the list in front.
    const nothing = nothingOpen({ ...model, open: { ...model.open, item: undefined } }, NEW_THREAD_KEY);
    // Beside a running agent's home, what stands there is a file to pick.
    const file = nothing !== undefined && nothing.start !== "none" && page.tab === "home" && listView?.ofAgent === true;
    const words = file ? PICK_FILE : (nothing?.said ?? "");
    pane = <Empty sigil={listView?.ofAgent === true ? listView.look?.sigil : undefined} words={words} />;
  }

  return (
    <ReloadOffer.Provider value={outOfDate}>
      <div
        class="app"
        ref={app}
        data-mode={mode}
        data-level={String(page.level)}
        data-turned={String(watching !== undefined)}
        data-stale={String(stale)}
        data-fold={String(fold)}
        data-peek={String(fold && peek)}
      >
        <div class="panes" ref={lists}>
          <aside
            class="pane rail"
            {...peeking}
            onClickCapture={(event) => {
              // On a touch screen the first tap on the strip brings the lists back, and chooses nothing.
              if (!fold || peek) return;
              event.preventDefault();
              event.stopPropagation();
              setPeek(true);
            }}
          >
            <Rail
              agents={agents}
              running={running}
              current={page.level >= 2 ? list?.id : undefined}
              notes={railNotes}
              retry={retryLine}
              me={model.me?.name}
              device={browserLabel(navigator.userAgent)}
              mode={mode}
              corner={
                <button class="ib fold-btn" type="button" aria-pressed={fold} title={fold ? UNFOLD : FOLD} aria-label={fold ? UNFOLD : FOLD} onClick={toggleFold}>
                  <Glyph name="panes" />
                </button>
              }
              footer={
                push === "ask" ? (
                  <button class="ib" type="button" title={CONTROLS.notify} aria-label={CONTROLS.notify} onClick={() => void askPush().then(setPush, () => setPush("ask"))}>
                    <Glyph name="bell" />
                  </button>
                ) : null
              }
              choose={choose}
              toggleMode={() =>
                setMode((before) => {
                  const next = before === "dusk" ? "day" : "dusk";
                  keep("mode", next);
                  return next;
                })
              }
            />
          </aside>
          <section class="pane list" {...peeking}>
            {listView !== undefined && (
              <ListView
                list={{ ...listView, notes: listNotes }}
                tab={page.tab}
                tabs={{
                  triggers: <TriggerCards key={listAgent} state={state} name={listView.name} triggers={model.triggers} none={listView.noTriggers} now={now} />,
                  home: <HomeTree key={listAgent} state={state} name={listView.name} current={file} choose={openFile} />,
                }}
                filter={page.filter}
                current={front ? (item?.kind === "thread" ? item.thread : item?.session) : undefined}
                retry={retryLine}
                back={back}
                start={startThread}
                open={choose}
                setFilter={(filter) => setPage((before) => ({ ...before, filter }))}
                setTab={(tab) =>
                  // A file stays open while its home is on show.
                  setPage((before) => ({ ...before, tab, ...(tab === "home" || before.file === undefined ? {} : { file: undefined, level: 2 }) }))
                }
              />
            )}
          </section>
          <section class="pane thread" onPointerDown={() => setPeek(false)}>
            {pane}
          </section>
          <section class="pane watch" onPointerDown={() => setPeek(false)}>
            {watching !== undefined && <WatchView session={{ ...watching, notes: watchNotes }} close={back} show={(agent) => state.showView(agent)} retry={retryLine} />}
          </section>
        </div>
      </div>
    </ReloadOffer.Provider>
  );
}
