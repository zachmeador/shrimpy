import type { Holdings } from "./holdings.ts";
import { type AgentEntry, agentOfThread, listedIn, openedThread, type Place, readOnlyEntries } from "./model.ts";
import type { Store } from "./store.ts";

/** Where the person goes: an agent's screen or a room's, a thread or a session, and back. */
export interface Moves {
  selectAgent(id: string): void;
  selectChannel(place: Extract<Place, { id: string }>): void;
  /** Open one of the threads on show, or start one there when `threadId` is undefined. */
  open(threadId: string | undefined): void;
  turnOver(): void;
  openSession(address: string): void;
  back(): void;
  /** With one agent and no room to choose from, take the person to the agent, once chat has said which channels they have. */
  land(entries: AgentEntry[]): void;
  /** Whether the person has been taken to the only agent there is, or has found their own way. */
  landed(): boolean;
}

export function createMoves(store: Store, held: Holdings): Moves {
  let landed = false;
  const moves: Moves = {
    selectAgent(id) {
      landed = true;
      held.useAgent(id);
      held.useThread(undefined);
      held.useSession(undefined, undefined);
      store.set({ where: { screen: "threads", place: { kind: "agent", id } }, thread: undefined, session: undefined, refusal: undefined, notice: undefined });
    },
    selectChannel(place) {
      landed = true;
      held.useAgent(undefined);
      held.useThread(undefined);
      held.useSession(undefined, undefined);
      store.set({ where: { screen: "threads", place }, thread: undefined, session: undefined, notice: undefined });
    },
    open(threadId) {
      const model = store.model();
      const { where } = model;
      if (where.screen !== "threads" && where.screen !== "thread") return;
      // A channel the person only reads takes no new thread.
      if (threadId === undefined && where.place.kind === "read-only") return;
      landed = true;
      const next = openedThread(model, where, threadId);
      held.useThread(threadId);
      const agent = next.screen === "thread" ? agentOfThread(next) : undefined;
      held.useSession(threadId === undefined ? undefined : agent, threadId);
      store.set({ where: next, thread: undefined, session: undefined, notice: undefined });
    },
    turnOver() {
      const model = store.model();
      const { where } = model;
      if (where.screen !== "thread" || where.thread === undefined || agentOfThread(where) === undefined) return;
      // A thread with no session behind it has nothing to turn over to; one that is turned over can always be turned back.
      if (where.turned !== true && model.session === undefined) return;
      store.set({ where: { ...where, turned: where.turned !== true }, notice: undefined });
    },
    openSession(address) {
      const { where } = store.model();
      if (where.screen !== "threads" || where.place.kind !== "agent") return;
      held.useThread(undefined);
      held.useSession(where.place.id, address);
      store.set({ where: { screen: "session", agent: where.place.id, session: address }, session: undefined, notice: undefined, refusal: undefined });
    },
    back() {
      const { where } = store.model();
      if (where.screen === "thread" || where.screen === "session") {
        held.useThread(undefined);
        held.useSession(undefined, undefined);
        store.set({ where: { screen: "threads", place: listedIn(where) }, thread: undefined, session: undefined, notice: undefined, refusal: undefined });
      } else if (where.screen === "threads") {
        held.useAgent(undefined);
        store.set({ where: { screen: "agents" }, agent: undefined, sessions: undefined, notice: undefined, refusal: undefined });
      }
    },
    land(entries) {
      if (landed || held.chat.shown() === undefined || entries.length === 0) return;
      landed = true;
      const model = store.model();
      const [only] = entries;
      const channelsToChoose = Object.keys(model.rooms).length + readOnlyEntries(model).length;
      if (only !== undefined && entries.length === 1 && channelsToChoose === 0 && model.where.screen === "agents") moves.selectAgent(only.id);
    },
    landed: () => landed,
  };
  return moves;
}
