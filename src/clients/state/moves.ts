import type { Holdings } from "./holdings.ts";
import { type AgentEntry, agentOfList, type Item, nextSide, type Place, placeKey, placeOf, readOnlyEntries, sidesOf } from "./model.ts";
import type { Store } from "./store.ts";

/**
 * What the person opens: an agent's list or a room's, a thread or a session in
 * it, a new thread, and which side of a thread is on show. Each says what is
 * open, and what is held follows from that.
 */
export interface Moves {
  selectAgent(id: string): void;
  selectChannel(place: Extract<Place, { kind: "room" | "read-only" }>): void;
  /** Open one of the threads of the open list. */
  open(threadId: string): void;
  /** Start a thread in `place`, or in the open list's own place when none is given. It comes to be with its first message. */
  start(place: Place | undefined): void;
  /** The new thread that is open came to be, as `threadId`, with its first message. */
  started(threadId: string): void;
  turnOver(): void;
  /** In a thread, put the view of the agent with member ID `agent` on show, if it is one of its sides. */
  showView(agent: string): void;
  openSession(address: string): void;
  /** With one agent and no room to choose from, open the agent's list, once chat has said which channels the person has. */
  land(entries: AgentEntry[]): void;
}

export function createMoves(store: Store, held: Holdings): Moves {
  let landed = false;

  /** Open `item` in the list that is open. */
  const openItem = (item: Item): void => {
    const { list } = store.model().open;
    if (list === undefined) return;
    landed = true;
    store.set({ open: { list, item }, notice: undefined });
  };

  /** Open `list`, which closes what was open in another. The list that is open stays as it is, with what is open in it. */
  const openList = (list: Place): void => {
    landed = true;
    const { open } = store.model();
    if (open.list !== undefined && placeKey(open.list) === placeKey(list)) return;
    store.set({ open: { list, item: undefined }, notice: undefined });
  };

  const moves: Moves = {
    selectAgent: (id) => openList({ kind: "agent", id }),
    selectChannel: (place) => openList(place),
    open(threadId) {
      const model = store.model();
      const { list } = model.open;
      if (list === undefined) return;
      // A thread that can't be had says so again when it is opened again.
      const thread = held.thread();
      if (thread?.id === threadId) thread.told = undefined;
      openItem({ kind: "thread", place: placeOf(model, list, threadId), thread: threadId, side: undefined });
    },
    start(given) {
      const place = given ?? store.model().open.list;
      // A channel the person only reads takes no new thread.
      if (place === undefined || place.kind === "read-only") return;
      openItem({ kind: "thread", place, thread: undefined, side: undefined });
    },
    started(threadId) {
      const { open } = store.model();
      const { item } = open;
      if (item?.kind !== "thread" || item.thread !== undefined) return;
      store.set({ open: { ...open, item: { ...item, thread: threadId } }, notice: undefined });
    },
    turnOver() {
      const model = store.model();
      const { open } = model;
      const { item } = open;
      if (item?.kind !== "thread" || item.thread === undefined) return;
      const side = nextSide(model);
      if (side === item.side) return;
      store.set({ open: { ...open, item: { ...item, side } }, notice: undefined });
    },
    showView(agent) {
      const model = store.model();
      const { open } = model;
      const { item } = open;
      if (item?.kind !== "thread" || item.thread === undefined || item.side === agent || !sidesOf(model).includes(agent)) return;
      store.set({ open: { ...open, item: { ...item, side: agent } }, notice: undefined });
    },
    openSession(address) {
      const agent = agentOfList(store.model().open);
      if (agent !== undefined) openItem({ kind: "session", agent, session: address });
    },
    land(entries) {
      if (landed || held.chat.shown() === undefined || entries.length === 0) return;
      landed = true;
      const model = store.model();
      const [only] = entries;
      const channelsToChoose = Object.keys(model.rooms).length + readOnlyEntries(model).length;
      if (only !== undefined && entries.length === 1 && channelsToChoose === 0 && model.open.list === undefined) moves.selectAgent(only.id);
    },
  };
  return moves;
}
