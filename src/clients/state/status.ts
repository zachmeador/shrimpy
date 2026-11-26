import type { SessionActivity, SessionSummary } from "../../contracts/agent/index.ts";
import {
  agentEntries,
  agentNameOf,
  agentRuns,
  type DevicesStatus,
  type Model,
  onceTriggersIn,
  openThreadOf,
  processesIn,
  standingTriggersIn,
  type Status,
  watchesIn,
  workingIn,
} from "./model.ts";

/**
 * What `/status` finds out about the thread the person is in, as it stands in
 * the model now, with `sessions` as the agent listed them when it was asked, if
 * it could be: the agent in a DM, or the agents of a room. Nothing is found out
 * for a person who is in no thread, or in a thread of a channel they only read.
 */
export function statusOf(model: Model, sessions: SessionSummary[] | undefined, at: number): Status | undefined {
  const { item } = model.open;
  if (item === undefined) return undefined;
  const { place } = item;
  if (place.kind === "read-only") return undefined;
  const thread = openThreadOf(model);
  const threadId = item.thread;
  const entries = agentEntries(model);

  if (place.kind === "room") {
    const members = (model.rooms[place.id]?.channel.members ?? []).filter((member) => member.kind === "agent");
    const agents = members
      .map((member) => ({
        name: member.name,
        running: entries.find((entry) => entry.id === member.id)?.running ?? false,
        working: thread !== undefined && workingIn(thread, member.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const processes =
      threadId === undefined ? [] : processesIn(model, threadId).map(({ agent, process }) => ({ agent: agentNameOf(model, agent), process }));
    const watches =
      threadId === undefined
        ? []
        : watchesIn(model, threadId).map(({ agent, watch }) => ({ agent: agentNameOf(model, agent), watch, running: agentRuns(model, watch.onAgent) }));
    const onceTriggers =
      threadId === undefined ? [] : onceTriggersIn(model, threadId).map(({ agent, trigger }) => ({ agent: agentNameOf(model, agent), trigger }));
    const standingTriggers =
      threadId === undefined ? [] : standingTriggersIn(model, threadId).map(({ agent, trigger }) => ({ agent: agentNameOf(model, agent), trigger }));
    return { at, about: { kind: "room", agents, processes, watches, onceTriggers, standingTriggers } };
  }

  const { id } = place;
  const entry = entries.find((each) => each.id === id);
  const name = agentNameOf(model, id);
  const reached = model.agent?.state === "up";
  // A session seen before the agent went away says nothing about now.
  const view = reached ? model.behind[id] : undefined;
  const sessionBusy = view?.status.busy === true;
  const marked = thread !== undefined && entry !== undefined && workingIn(thread, entry.id);
  const idle: SessionActivity = { kind: "idle" };
  const processes = threadId === undefined ? [] : processesIn(model, threadId).filter((each) => each.agent === id).map((each) => each.process);
  const watches =
    threadId === undefined
      ? []
      : watchesIn(model, threadId)
          .filter((each) => each.agent === id)
          .map(({ watch }) => ({ watch, running: agentRuns(model, watch.onAgent) }));
  const standingTriggers =
    threadId === undefined ? [] : standingTriggersIn(model, threadId).filter((each) => each.agent === id).map((each) => each.trigger);
  const onceTriggers =
    threadId === undefined ? [] : onceTriggersIn(model, threadId).filter((each) => each.agent === id).map((each) => each.trigger);
  return {
    at,
    about: {
      kind: "agent",
      name,
      running: entry?.running ?? false,
      version: entry?.version,
      reached,
      doing: thread === undefined ? undefined : sessionBusy ? view.status.activity : marked ? { kind: "working" } : idle,
      session:
        view === undefined
          ? undefined
          : {
              queued: view.status.queued.length,
              model: view.status.model,
              own: view.status.ownModel,
              defaultModel: model.defaultModel,
              usage: view.status.usage,
              failure: view.status.failure,
              onceTriggers,
            },
      processes,
      watches,
      standingTriggers,
      othersWorking: sessions?.filter((each) => each.working && each.id !== item.thread).length,
    },
  };
}

/** The person's devices, from the ways in the roster lists: each device's label and ID, in the roster's order. */
export function devicesOf(model: Pick<Model, "listing">): DevicesStatus["devices"] {
  return (model.listing?.ways ?? []).filter((way) => way.kind === "device").map((way) => ({ label: way.label, id: way.id }));
}
