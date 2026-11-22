import type { AgentShown, GatewayLink, ThreadShown } from "../network/index.ts";
import { channelsOf } from "./channels.ts";
import type { HeldSession, Holdings } from "./holdings.ts";
import {
  agentEntries,
  type ChannelThreads,
  type Model,
  type Open,
  type Place,
  type SessionView,
  type ThreadView,
} from "./model.ts";

/**
 * The model with what the held objects show worked in: what the gateway
 * lists, the person's channels and their threads, the agent whose list is open
 * and its sessions, the open thread and the sessions behind it, the open
 * session behind no thread, and what each agent of the roll call is working
 * in. What is held is what is open. A room the person joins while reading it
 * is theirs from then on.
 */
export function worked(model: Model, held: Holdings, link: GatewayLink): Model {
  const shownRoster = held.roster.shown();
  const version = link.version() ?? model.listing?.version ?? "";
  const listing = shownRoster === undefined ? model.listing : { ...shownRoster, version };
  const linked = (kind: "chat" | "agent", member?: string): boolean =>
    listing?.programs.some((program) => program.kind === kind && (member === undefined || program.member === member)) ?? false;
  const shownChat = held.chat.shown();
  const { dms, rooms, readOnly } = channelsOf(
    shownChat?.channels ?? [],
    shownChat?.readOnlyChannels ?? [],
    (id) => held.channel(id)?.shown(),
    agentEntries({ ...model, listing }),
  );
  const open = joined(model.open, rooms);
  const agent = held.agent();
  const agentShown = agent?.held.shown();
  const { item } = open;
  const reached = (session: HeldSession): boolean => session.held.status(linked("agent", session.agent)).state === "up";
  const behind: Model["behind"] = {};
  if (item?.kind === "thread") {
    for (const [id, session] of held.sessions()) {
      const view = sessionViewOf(session, item.side === id, reached(session));
      if (view !== undefined) behind[id] = view;
    }
  }
  const watched = item?.kind === "session" ? held.sessions().get(item.agent) : undefined;
  const workingSessions: Model["workingSessions"] = {};
  for (const [id, each] of held.rollCall()) {
    const working = sessionsWorking(each.shown(), each.status(linked("agent", id)).state === "up");
    if (working.length > 0) workingSessions[id] = working;
  }
  return {
    ...model,
    listing,
    open,
    gateway: link.status(),
    chat: held.chat.status(linked("chat")),
    me: shownChat?.you ?? model.me,
    dms,
    rooms,
    readOnly,
    agent: agent === undefined ? undefined : agent.held.status(linked("agent", agent.id)),
    sessions: agentShown === undefined || agentShown.refusal !== null ? undefined : agentShown.sessions,
    refusal: agentShown?.refusal?.words,
    watchRefusal: watched?.held.shown()?.refusal?.words,
    thread: threadViewOf(held.thread()?.held.shown()),
    behind,
    watched: watched === undefined ? undefined : sessionViewOf(watched, true, reached(watched)),
    workingSessions,
  };
}

/** What is open, with a room the person read and has since joined theirs: its list, and the place of a thread of it, become the room's. */
function joined(open: Open, rooms: Record<string, ChannelThreads>): Open {
  const mine = (place: Place): Place => (place.kind === "read-only" && rooms[place.id] !== undefined ? { kind: "room", id: place.id } : place);
  const list = open.list === undefined ? undefined : mine(open.list);
  const { item } = open;
  const place = item?.kind === "thread" ? mine(item.place) : undefined;
  if (list === open.list && (item?.kind !== "thread" || place === item.place)) return open;
  return { list, item: item?.kind === "thread" && place !== undefined ? { ...item, place } : item };
}

/** What an agent of the roll call is working in, as it lists it: nothing when it is not reached, or refuses. */
function sessionsWorking(shown: AgentShown | undefined, reached: boolean): AgentShown["sessions"] {
  if (!reached || shown === undefined || shown.refusal !== null) return [];
  return shown.sessions.filter((each) => each.working);
}

/** The open thread as it now stands, or none while chat has not shown it or refuses it. */
function threadViewOf(shown: ThreadShown | undefined): ThreadView | undefined {
  if (shown === undefined || shown.refusal !== null || shown.thread === null) return undefined;
  const { thread, messages, earlier, readOnly, unread } = shown;
  return { thread, messages, earlier, readOnly, unread: unread ?? 0 };
}

/**
 * A session held as a view, whether its agent is `reached`, with what was read
 * back before its window when it is on show `whole` and that follows on from
 * the window.
 */
function sessionViewOf(session: HeldSession, whole: boolean, reached: boolean): SessionView | undefined {
  const shown = session.held.shown();
  if (shown === undefined || shown.refusal !== null || shown.status === null) return undefined;
  const { window } = shown;
  const { older } = session;
  if (window.before === null || older === undefined || older.from !== window.before || !whole) {
    return { items: window.items, before: window.before, status: shown.status, reached };
  }
  return { items: [...older.items, ...window.items], before: older.before, status: shown.status, reached };
}
