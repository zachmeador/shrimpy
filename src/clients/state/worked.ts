import type { AgentShown, GatewayLink, LinkStatus } from "../network/index.ts";
import { channelsOf } from "./channels.ts";
import type { HeldSession, Holdings, OpenThread } from "./holdings.ts";
import {
  agentEntries,
  type ChannelThreads,
  type Model,
  type Open,
  type Place,
  processOutputKey,
  type SessionView,
  type ThreadView,
} from "./model.ts";

/**
 * The model with what the held objects show worked in: what the gateway
 * lists, the person's channels and their threads, the agent whose list is open
 * and its sessions, the open thread and the sessions behind it, and what each
 * running agent of the roll call is working on, running in the background,
 * waiting on, or has scheduled. A room the person joins while reading it is
 * theirs from then on.
 */
export function worked(model: Model, held: Holdings, link: GatewayLink): Model {
  const shownRoster = held.roster.shown();
  const versions = link.versions() ?? model.listing?.versions;
  const machine = link.machine() ?? model.listing?.machine;
  const listing = shownRoster === undefined ? model.listing : { ...shownRoster, versions, machine };
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
  if (item !== undefined) {
    for (const [id, session] of held.sessions()) {
      const view = sessionViewOf(session, item.side === id, reached(session));
      if (view !== undefined) behind[id] = view;
    }
  }
  const workingSessions: Model["workingSessions"] = {};
  const processesByAgent: Model["processesByAgent"] = {};
  const watchesByAgent: Model["watchesByAgent"] = {};
  const onceTriggersByAgent: Model["onceTriggersByAgent"] = {};
  const triggersByAgent: Model["triggersByAgent"] = {};
  const looks: Model["looks"] = {};
  const ingest = (id: string, shown: AgentShown | undefined, isUp: boolean): void => {
    if (shown !== undefined) looks[id] = { sigil: shown.sigil, pigment: shown.pigment };
    if (!isUp || shown === undefined || shown.refusal !== null) return;
    const working = shown.sessions.filter((each) => each.working);
    if (working.length > 0) workingSessions[id] = working;
    if (shown.processes.length > 0) processesByAgent[id] = shown.processes;
    if (shown.watches.length > 0) watchesByAgent[id] = shown.watches;
    if (shown.onceTriggers.length > 0) onceTriggersByAgent[id] = shown.onceTriggers;
    triggersByAgent[id] = shown.triggers;
  };
  for (const [id, each] of held.rollCall()) {
    ingest(id, each.shown(), each.status(linked("agent", id)).state === "up");
  }
  if (agent !== undefined) {
    ingest(agent.id, agentShown, agent.held.status(linked("agent", agent.id)).state === "up");
  }
  // Drop cached process outputs for processes that are no longer running.
  const activeProcs = new Set<string>();
  for (const [id, procs] of Object.entries(processesByAgent)) {
    for (const proc of procs) activeProcs.add(processOutputKey(id, proc.id));
  }
  let processOutputs = model.processOutputs;
  if (Object.keys(processOutputs).some((key) => !activeProcs.has(key))) {
    processOutputs = Object.fromEntries(Object.entries(processOutputs).filter(([key]) => activeProcs.has(key)));
  }

  const channels = [...(shownChat?.channels ?? []), ...(shownChat?.readOnlyChannels ?? [])];
  const chat = waiting(held.chat.status(linked("chat")), [
    held.thread()?.held.status(linked("chat")),
    ...channels.map((channel) => held.channel(channel.id)?.status(linked("chat"))),
  ]);
  const agentStatus =
    agent === undefined
      ? undefined
      : waiting(
          agent.held.status(linked("agent", agent.id)),
          [...held.sessions().values()].filter((session) => session.agent === agent.id).map((session) => session.held.status(linked("agent", agent.id))),
        );
  return {
    ...model,
    listing,
    open,
    gateway: link.status(),
    chat,
    me: shownChat?.you ?? model.me,
    dms,
    rooms,
    readOnly,
    agent: agentStatus,
    sessions: agentShown === undefined || agentShown.refusal !== null ? undefined : agentShown.sessions,
    triggers: agentShown === undefined || agentShown.refusal !== null ? undefined : agentShown.triggers,
    defaultModel: agentShown?.model ?? undefined,
    refusal: agentShown?.refusal?.words,
    thread: threadViewOf(held.thread()),
    behind,
    workingSessions,
    processesByAgent,
    watchesByAgent,
    onceTriggersByAgent,
    triggersByAgent,
    processOutputs,
    looks,
  };
}

/**
 * Where the link to a program stands, from its main object's `status`, or
 * waiting for another version when any of `others`, more of what is held of
 * it, waits for that, since a release may change one object and not another.
 */
function waiting(status: LinkStatus, others: readonly (LinkStatus | undefined)[]): LinkStatus {
  const other = others.some((each) => each?.state === "down" && each.why.kind === "other-version");
  return other ? { state: "down", why: { kind: "other-version" } } : status;
}

/** What is open, with a room the person read and has since joined theirs: its list, and the place of a thread of it, become the room's. */
function joined(open: Open, rooms: Record<string, ChannelThreads>): Open {
  const mine = (place: Place): Place => (place.kind === "read-only" && rooms[place.id] !== undefined ? { kind: "room", id: place.id } : place);
  const list = open.list === undefined ? undefined : mine(open.list);
  const { item } = open;
  const place = item === undefined ? undefined : mine(item.place);
  if (list === open.list && (item === undefined || place === item.place)) return open;
  return { list, item: item !== undefined && place !== undefined ? { ...item, place } : item };
}

/** The open thread as it now stands, or none while chat has not shown it or refuses it. */
function threadViewOf(open: OpenThread | undefined): ThreadView | undefined {
  const shown = open?.held.shown();
  if (open === undefined || shown === undefined || shown.refusal !== null || shown.thread === null) return undefined;
  const { thread, messages, earlier, readOnly, unread } = shown;
  return { thread, messages, earlier, readOnly, unread: unread ?? 0, firstNew: open.firstNew };
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
