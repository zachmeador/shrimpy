import type { ModelId, SessionActivity, SessionSummary } from "../../../contracts/agent/index.ts";
import type { Thread } from "../../../contracts/chat/index.ts";
import { agentEntries, type Model, type Place, type Status, type Where, workingIn } from "./model.ts";

/** The thread the person is in, as far as the console knows it: undefined for one that is not started. */
function threadOf(model: Model, where: Extract<Where, { screen: "thread" }>, place: Exclude<Place, { kind: "read-only" }>): Thread | undefined {
  if (where.thread === undefined) return undefined;
  if (model.thread?.thread.id === where.thread) return model.thread.thread;
  const threads = place.kind === "agent" ? model.dms[place.name]?.threads : model.rooms[place.id]?.threads;
  return threads?.find((each) => each.id === where.thread);
}

/**
 * What `/status` finds out about the thread the person is in, as it stands in
 * the model now, with `sessions` as the agent listed them when it was asked,
 * if it could be, and `defaultModel` as it said when it was asked: the agent in
 * a DM, or the agents of a room. Nothing is found out for a person who is in no
 * thread, or in a thread of a channel they only read.
 */
export function statusOf(
  model: Model,
  sessions: SessionSummary[] | undefined,
  at: number,
  defaultModel?: ModelId,
): Status | undefined {
  const { where } = model;
  if (where.screen !== "thread" || where.place.kind === "read-only") return undefined;
  const { place } = where;
  const thread = threadOf(model, where, place);
  const entries = agentEntries(model);

  if (place.kind === "room") {
    const members = model.rooms[place.id]?.channel.members ?? [];
    const agents = members
      .filter((member) => member.kind === "agent")
      .map((member) => ({
        name: member.name,
        running: entries.find((entry) => entry.id === member.id)?.running ?? false,
        working: thread !== undefined && workingIn(thread, member.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { at, about: { kind: "room", agents } };
  }

  const { name } = place;
  const entry = entries.find((each) => each.name === name);
  const reached = model.agent?.state === "up";
  // A session seen before the agent went away says nothing about now.
  const view = reached ? model.session : undefined;
  const sessionBusy = view?.status.busy === true;
  const marked = thread !== undefined && entry !== undefined && workingIn(thread, entry.id);
  const idle: SessionActivity = { kind: "idle" };
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
              defaultModel,
              usage: view.status.usage,
            },
      othersWorking: sessions?.filter((each) => each.working && each.id !== where.thread).length,
    },
  };
}
