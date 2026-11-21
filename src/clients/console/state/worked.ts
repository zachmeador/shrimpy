import type { AgentShown, GatewayLink, SessionShown, ThreadShown } from "../network/index.ts";
import { channelsOf } from "./channels.ts";
import type { Holdings, SessionOnShow } from "./holdings.ts";
import { agentEntries, type ChannelThreads, type Model, type SessionView, type ThreadView, watchedWhole, type Where } from "./model.ts";

/**
 * The model with what the held objects show worked in: what the gateway
 * lists, the person's channels and their threads, the agent on show and its
 * sessions, the open thread, the session on show, and what each agent of the
 * roll call is working in. A room the person joins while reading it is theirs
 * from then on.
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
  const where = joined(model.where, rooms);
  const agent = held.agent();
  const agentShown = agent?.held.shown();
  const workingSessions: Model["workingSessions"] = {};
  for (const [id, each] of held.rollCall()) {
    const working = sessionsWorking(each.shown(), each.status(linked("agent", id)).state === "up");
    if (working.length > 0) workingSessions[id] = working;
  }
  return {
    ...model,
    listing,
    where,
    gateway: link.status(),
    chat: held.chat.status(linked("chat")),
    me: shownChat?.you ?? model.me,
    dms,
    rooms,
    readOnly,
    agent: agent === undefined ? undefined : agent.held.status(linked("agent", agent.id)),
    sessions: agentShown === undefined || agentShown.refusal !== null ? undefined : agentShown.sessions,
    refusal: refusalOf(where, agentShown, held.session()?.held.shown()),
    thread: threadViewOf(held.thread()?.held.shown()),
    session: sessionViewOf(held.session(), where),
    workingSessions,
  };
}

/** Where the person is, with a room they read and have since joined theirs: the screen becomes the room's. */
function joined(where: Where, rooms: Record<string, ChannelThreads>): Where {
  if ((where.screen === "threads" || where.screen === "thread") && where.place.kind === "read-only" && rooms[where.place.id] !== undefined) {
    return { ...where, place: { kind: "room", id: where.place.id } };
  }
  return where;
}

/** What an agent of the roll call is working in, as it lists it: nothing when it is not reached, or refuses. */
function sessionsWorking(shown: AgentShown | undefined, reached: boolean): AgentShown["sessions"] {
  if (!reached || shown === undefined || shown.refusal !== null) return [];
  return shown.sessions.filter((each) => each.working);
}

/** What the agent said when it would not list its sessions on its screen, or let the session on show be watched. */
function refusalOf(where: Where, agent: AgentShown | undefined, session: SessionShown | undefined): string | undefined {
  let refusal: string | undefined;
  const listingAgent = where.screen === "threads" && where.place.kind === "agent";
  if (listingAgent && agent?.refusal !== null && agent?.refusal !== undefined) refusal = agent.refusal.words;
  if (where.screen === "session" && session?.refusal !== null && session?.refusal !== undefined) refusal = session.refusal.words;
  return refusal;
}

/** The open thread as it now stands, or none while chat has not shown it or refuses it. */
function threadViewOf(shown: ThreadShown | undefined): ThreadView | undefined {
  if (shown === undefined || shown.refusal !== null || shown.thread === null) return undefined;
  const { thread, messages, earlier, readOnly } = shown;
  return { thread, messages, earlier, readOnly };
}

/** The session on show as a view, with what was read back before its window when that follows on from it. */
function sessionViewOf(session: SessionOnShow | undefined, where: Where): SessionView | undefined {
  const shown = session?.held.shown();
  if (session === undefined || shown === undefined || shown.refusal !== null || shown.status === null) return undefined;
  const { window } = shown;
  const { older } = session;
  if (window.before === null || older === undefined || older.from !== window.before || !watchedWhole(where)) {
    return { items: window.items, before: window.before, status: shown.status };
  }
  return { items: [...older.items, ...window.items], before: older.before, status: shown.status };
}
