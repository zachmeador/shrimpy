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
import { agentEntries, agentNameOf, type ClientState, type Model, type Place, placeKey, placeOfThread, sidesOf, writtenInOpen } from "../state/index.ts";
import {
  type AgentTab,
  agentsLevel,
  browserLabel,
  fileLevel,
  type InFull,
  listLevel,
  modelLines,
  nextTry,
  nothingOpen,
  pageLevel,
  type Row,
  sessionLevel,
  tabHolding,
  threadLevel,
  windowTitle,
  writeTo,
} from "../view/index.ts";
import { addressOf, type Route, routeOf } from "./address.ts";
import { setCount } from "./badge.ts";
import { ListView } from "./list.tsx";
import { Glyph } from "./marks.tsx";
import { FileView, PageView } from "./page.tsx";
import { askPush, onTapped, type Push, startPush } from "./push.ts";
import { Rail } from "./rail.tsx";
import { Empty, ReloadOffer, type StillOpen, ThreadView } from "./thread.tsx";
import { WatchView } from "./watch.tsx";
import { CONTROLS, FOLD, keyHints, NEW_THREAD_KEY, pageOutOfDate, SELF, UNFOLD } from "./words.ts";

/** When the page next tries to reach the gateway, as the pauses it gives the link say. */
export interface Retry {
  /** The moment of the next try, in milliseconds since the epoch, or undefined while none waits. */
  at(): number | undefined;
  subscribe(listener: () => void): () => void;
}

const CLOSED_STILL: StillOpen = { proc: false, wait: false, trig: false };

/** What only the page holds. */
interface PageState {
  /** Which level is in front: agents and rooms, the open list, or what is open in it. */
  level: 1 | 2 | 3;
  /** The tab on show of an agent's list. */
  tab: AgentTab;
  /** The agent's page is in front, where a thread would be: on a phone it has a level of its own. */
  onPage: boolean;
  /** The file of the agent's home open where its page was, by its path there. */
  file: string | undefined;
  /** The folders open in the tree of the agent's home, by their paths there, and whose home it is. */
  opened: { agent: string | undefined; folders: ReadonlySet<string> };
  inFull: InFull;
  /** Which rows of the thread's `.still` block are opened in place. */
  stillOpen: StillOpen;
  /** The agent whose work is open where several work in a thread. */
  work: string | undefined;
  /** The open thread's menu is open. */
  menu: boolean;
  /** The open thread's name is an input where it stands. */
  naming: boolean;
  /** The list whose archived threads are open in place, by `placeKey`. Another list opens with its own shut. */
  archived: string | undefined;
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
  if (page.level === 3 && page.file !== undefined && list.kind === "agent") return { kind: "list", list, tab: page.tab, shown: { kind: "file", path: page.file } };
  if (page.level === 3 && page.onPage && list.kind === "agent") return { kind: "list", list, tab: page.tab, shown: { kind: "page" } };
  if (page.level === 2 || item === undefined) return { kind: "list", list, tab: page.tab, shown: undefined };
  return { kind: "list", list, tab: page.tab, shown: { kind: "thread", thread: item.thread, view: item.side !== undefined } };
}

/** The file a route opens, if it opens one. */
const fileOf = (route: Route): string | undefined => (route.kind === "list" && route.shown?.kind === "file" ? route.shown.path : undefined);

/** Whether a route opens an agent's page. */
const pageIn = (route: Route): boolean => route.kind === "list" && route.shown?.kind === "page";

/** The folders a file is in, from the home's top down: "a", then "a/b", for "a/b/c.md". */
const foldersOf = (path: string | undefined): string[] =>
  (path ?? "")
    .split("/")
    .slice(0, -1)
    .map((_, at, parts) => parts.slice(0, at + 1).join("/"));

/** What a route puts in front of the page's own state: its level, the tab, the page or the file, and the folders that file is in, open. */
function frontOf(route: Route, before: PageState): Pick<PageState, "level" | "tab" | "onPage" | "file" | "opened"> {
  const file = fileOf(route);
  const agent = route.kind === "list" && route.list.kind === "agent" ? route.list.id : before.opened.agent;
  const keptFolders = agent === before.opened.agent ? before.opened.folders : new Set<string>();
  return {
    level: levelOf(route),
    tab: route.kind === "list" ? route.tab : before.tab,
    onPage: pageIn(route),
    file,
    opened: { agent, folders: file === undefined ? keptFolders : new Set([...keptFolders, ...foldersOf(file)]) },
  };
}

/** The level a route puts in front. */
function levelOf(route: Route): PageState["level"] {
  if (route.kind === "agents") return 1;
  if (route.kind === "thread") return 3;
  return route.shown === undefined ? 2 : 3;
}

/** The route one level up from `route`: from the agent's view to the conversation, from a file of an agent's home to its page, from a thread or the page to its list, from a list to agents and rooms. */
function upFrom(route: Route): Route {
  if (route.kind !== "list") return { kind: "agents" };
  const { shown } = route;
  if (shown === undefined) return { kind: "agents" };
  if (shown.kind === "thread" && shown.view) return { ...route, shown: { ...shown, view: false } };
  if (shown.kind === "file") return { ...route, shown: { kind: "page" } };
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
    const start: PageState = {
      level: 1,
      tab: "chat",
      onPage: false,
      file: undefined,
      opened: { agent: undefined, folders: new Set() },
      inFull: { toolCalls: false, thinking: false },
      stillOpen: CLOSED_STILL,
      work: undefined,
      menu: false,
      naming: false,
      archived: undefined,
    };
    return { ...start, ...frontOf(route, start) };
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
    const { open } = state.model();
    // Atomic open when jumping straight to an agent's thread, avoiding an intermediate close.
    if (shown?.kind === "thread" && shown.thread !== undefined && list.kind === "agent") {
      if (!samePlace(open.list, list) || open.item?.thread !== shown.thread) state.openFrom(list.id, shown.thread);
    } else {
      if (!samePlace(open.list, list)) {
        if (list.kind === "agent") state.selectAgent(list.id);
        else if (list.kind === "room") state.selectRoom(list.id);
        else state.selectReadOnly(list.id);
      }
      const { item } = state.model().open;
      // The agent's page, and a file of its home, stand where a thread would while none is open.
      if (shown?.kind === "page" || shown?.kind === "file") {
        if (item !== undefined) state.closeItem();
        return true;
      }
      if (shown?.kind !== "thread") return true;
      if (shown.thread === undefined) {
        if (item === undefined || item.thread !== undefined) state.startThread();
        return true;
      }
      if (item === undefined || item.thread !== shown.thread) state.openThread(shown.thread);
    }
    const side = (): boolean => state.model().open.item?.side !== undefined;
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
    const timer = setTimeout(() => setPending((nowPending) => (nowPending === pending ? { ...nowPending, patient: false } : nowPending)), WAIT_MS);
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
      else if (!settle({ kind: "list", list, tab: "chat", shown: { kind: "thread", thread: route.thread, view: false } }, !patient)) return;
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
      setPage((before) => ({ ...before, ...frontOf(route, before), stillOpen: CLOSED_STILL }));
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
    const pushNow = pushing.current;
    pushing.current = false;
    if (address === location.pathname) return;
    if (pushNow) history.pushState({ up: location.pathname }, "", address);
    else history.replaceState(history.state, "", address);
  });

  // A notification tapped while the page is open opens its thread here.
  const tapped = useRef<(thread: string) => void>(() => undefined);
  useEffect(() => onTapped((thread) => tapped.current(thread)), []);

  // A thread opens its agent's list on the tab that holds it.
  const holding = tabHolding(model);
  const opening = JSON.stringify([model.open.list ?? null, model.open.item?.thread ?? null]);
  useEffect(() => {
    if (holding !== undefined) setPage((before) => (before.tab === holding ? before : { ...before, tab: holding }));
  }, [opening, holding]);

  // The person is looking at a thread while it is in front and the page is on show.
  const looking = visible && page.level === 3 && page.file === undefined && !page.onPage && model.open.item !== undefined;
  useEffect(() => state.look(looking), [state, looking]);

  useLayoutEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", WOOLS[mode].pane);
  }, [mode]);

  /** Go to `route` as the person asked: open what it names, and let Back undo it. */
  const go = (route: Route): void => {
    pushing.current = true;
    setPending({ route, patient: false });
    setPage((before) => ({
      ...before,
      ...frontOf(route, before),
      stillOpen: CLOSED_STILL,
      work: undefined,
      menu: false,
      naming: false,
    }));
  };

  /** Go up a level: Back, when the page came from there. */
  const back = (): void => {
    const up = upFrom(routeNow(state.model(), page));
    const address = addressOf(up);
    if ((history.state as { up?: string } | null)?.up === address) return history.back();
    setPending({ route: up, patient: false });
    setPage((before) => ({ ...before, ...frontOf(up, before), stillOpen: CLOSED_STILL, menu: false, naming: false }));
  };

  const list = model.open.list;
  const item = model.open.item;
  const startThread = (): void => {
    const place = page.level === 3 && item !== undefined ? item.place : list;
    if (place === undefined || place.kind === "read-only") return;
    go({ kind: "list", list: list ?? place, tab: "chat", shown: { kind: "thread", thread: undefined, view: false } });
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
  const listView = page.level >= 2 ? listLevel(model, { ...at, tab: page.tab }) : undefined;
  const file = page.level === 3 && list?.kind === "agent" ? page.file : undefined;
  // An agent's page stands where a thread would while none is in front.
  const onPage = page.level >= 2 && list?.kind === "agent" && file === undefined && (page.level === 2 || page.onPage || item === undefined);
  const front = page.level === 3 && file === undefined && !onPage;
  const thread = front ? threadLevel(model, { ...at, inFull: page.inFull, outputLines: OUTPUT_LINES }) : undefined;
  const running = useMemo(() => runningOf(model), [model]);
  const listAgent = list?.kind === "agent" ? list.id : undefined;
  const retryLine = stale && nextAt !== undefined && nextAt > now ? nextTry(Math.ceil((nextAt - now) / 1000)) : undefined;

  // Fetch running command output tails whenever the thread's processes drawer is open.
  const openProcKey = page.stillOpen.proc ? (thread?.still.processes ?? []).map((proc) => `${proc.agent}\0${proc.id}`).join("\n") : "";
  useEffect(() => {
    if (openProcKey === "" || model.gateway.state !== "up") return;
    for (const pair of openProcKey.split("\n")) {
      const [agentId, procId] = pair.split("\0");
      if (agentId !== undefined && procId !== undefined) state.readProcessOutput(agentId, procId);
    }
  }, [state, openProcKey, model.gateway.state]);

  const shownFile = file === undefined ? undefined : fileLevel(model, file, SELF);
  // The folders open in the tree of the home of the agent whose list is open, which another agent's list leaves shut.
  const folders = page.opened.agent === listAgent ? page.opened.folders : new Set<string>();
  const shownPage = onPage ? pageLevel(model, { ...at, opened: folders }) : undefined;

  const turnable = thread?.turnable === true;
  const turned = front && item?.side !== undefined;
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
  const threadNotes = unsaid(everywhere(thread?.notes ?? shownPage?.notes ?? []), shownAbove);
  const watchNotes = unsaid(everywhere(watching?.notes ?? []), new Set([...shownAbove, ...threadNotes]));

  /** Put the next agent's view of the thread beside it, or over it on a phone, and after the last take it away. */
  const turn = (): void => {
    if (!front || item === undefined || list === undefined) return;
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
    if (event.key === "Escape" && page.menu) {
      event.preventDefault();
      setPage((before) => ({ ...before, menu: false }));
    } else if (event.key === "Escape" && fold && peek) {
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

  // A tap anywhere but on the thread's menu, or the button that opens it, shuts the menu.
  useEffect(() => {
    if (!page.menu) return;
    const tappedMenu = (event: PointerEvent): void => {
      if (event.target instanceof Element && event.target.closest('.menu, [aria-haspopup="menu"]') !== null) return;
      setPage((before) => ({ ...before, menu: false }));
    };
    document.addEventListener("pointerdown", tappedMenu);
    return () => document.removeEventListener("pointerdown", tappedMenu);
  }, [page.menu]);

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
    if (opensList(kind)) go({ kind: "list", list: { kind, id: row.id }, tab: "chat", shown: undefined });
    else if (list !== undefined) {
      go({ kind: "list", list, tab: page.tab, shown: { kind: "thread", thread: row.id, view: false } });
      // A thread opened again opens afresh, with its conversation on show.
      if (item?.thread === row.id) state.openThread(row.id);
    }
  };

  /** Open a thread from the list of `agentId`, letting `tabHolding` pick chat or observe. */
  const jump = (agentId: string, threadId: string): void => {
    setPeek(false);
    go({ kind: "list", list: { kind: "agent", id: agentId }, tab: "chat", shown: { kind: "thread", thread: threadId, view: false } });
  };

  const dmAgent = item?.place.kind === "agent" ? item.place.id : undefined;
  const models = useMemo(
    () =>
      dmAgent === undefined
        ? undefined
        : async () => {
            const found = await state.models();
            const { defaultModel } = state.model();
            return found === undefined || defaultModel === undefined ? undefined : modelLines(found, defaultModel, agentNameOf(state.model(), dmAgent));
          },
    [state, dmAgent],
  );

  const openPage = (): void => {
    if (list?.kind === "agent") go({ kind: "list", list, tab: page.tab, shown: { kind: "page" } });
  };
  const openFile = (path: string): void => {
    if (list?.kind === "agent") go({ kind: "list", list, tab: page.tab, shown: { kind: "file", path } });
  };
  /** Open a folder of the agent's home in place, reading what is in it, or shut it. */
  const toggleFolder = (path: string): void => {
    const next = new Set(folders);
    if (!next.delete(path)) {
      next.add(path);
      state.readFolder(path);
    }
    setPage((before) => ({ ...before, opened: { agent: listAgent, folders: next } }));
  };

  let pane;
  if (shownFile !== undefined) {
    pane = <FileView key={`${listAgent ?? ""}\n${shownFile.path}`} state={state} file={shownFile} reached={model.agent?.state === "up"} back={back} />;
  } else if (shownPage !== undefined) {
    pane = (
      <PageView
        key={listAgent}
        state={state}
        page={{ ...shownPage, notes: threadNotes }}
        opened={folders}
        startable={listView?.startable === true}
        small={layout === "phone"}
        reached={model.agent?.state === "up"}
        retry={retryLine}
        back={back}
        start={startThread}
        toggle={toggleFolder}
        choose={openFile}
        jump={jump}
      />
    );
  } else if (front && item !== undefined && thread !== undefined) {
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
        stillOpen={page.stillOpen}
        placeholder={writeTo(thread.who)}
        menu={page.menu}
        naming={page.naming}
        composer={{
          drafts,
          draftKey,
          models,
          // `/rename` alone turns the name into an input, where the thread can be renamed.
          submit: (text) => {
            if (!thread.nameable || writtenInOpen(state.model(), text).do !== "name") return state.write(text);
            setPage((before) => ({ ...before, menu: false, naming: true }));
            return Promise.resolve(true);
          },
          keys: keyHints({ newThread: thread.writable, turnOver: turnable }),
        }}
        back={back}
        turn={turn}
        toggleMenu={() => setPage((before) => ({ ...before, menu: !before.menu }))}
        name={(naming, typed) => {
          setPage((before) => ({ ...before, menu: false, naming }));
          if (typed !== undefined) void state.rename(typed);
        }}
        archive={() => {
          setPage((before) => ({ ...before, menu: false }));
          void state.archive(!thread.archived);
        }}
        join={() => void state.joinRoom()}
        toggleFull={(which) => setPage((before) => ({ ...before, inFull: { ...before.inFull, [which]: !before.inFull[which] } }))}
        toggleStill={(which) => setPage((before) => ({ ...before, stillOpen: { ...before.stillOpen, [which]: !before.stillOpen[which] } }))}
        openWork={(agent) => setPage((before) => ({ ...before, work: agent }))}
        jump={jump}
        killProcess={(agentId, procId) => void state.killProcess(agentId, procId)}
        cancelWatch={(agentId, watchId) => void state.cancelWatch(agentId, watchId)}
        cancelTrigger={(agentId, triggerId) => void state.cancelTrigger(agentId, triggerId)}
        switchTrigger={(agentId, name, on) => void state.switchTrigger(agentId, name, on)}
        stopWorking={() => {
          for (const each of thread.workingAgents) void state.stopSession(each.id);
        }}
      />
    );
  } else {
    // Nothing is open in the thread's place, whatever the state still holds open behind the list in front.
    pane = <Empty words={nothingOpen({ open: { list: page.level === 1 ? undefined : list, item: undefined } }, NEW_THREAD_KEY) ?? ""} />;
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
                archivedOpen={list !== undefined && page.archived === placeKey(list)}
                current={front ? item?.thread : undefined}
                retry={retryLine}
                back={back}
                start={startThread}
                open={choose}
                page={openPage}
                toggleArchived={() => {
                  if (list === undefined) return;
                  const key = placeKey(list);
                  setPage((before) => ({ ...before, archived: before.archived === key ? undefined : key }));
                }}
                setTab={(tab) => setPage((before) => ({ ...before, tab }))}
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
