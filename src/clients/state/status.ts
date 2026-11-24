import type { ModelId, SessionActivity, SessionSummary } from "../../contracts/agent/index.ts";
import { agentEntries, agentNameOf, type DevicesStatus, type Model, openThreadOf, type Status, workingIn } from "./model.ts";

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
  const { item } = model.open;
  if (item?.kind !== "thread") return undefined;
  const { place } = item;
  if (place.kind === "read-only") return undefined;
  const thread = openThreadOf(model);
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
    // A session seen before its agent went away says nothing about now.
    const wakeups = members
      .flatMap((member) => {
        const view = model.behind[member.id];
        return view?.reached === true ? view.status.wakeups.map((wakeup) => ({ agent: member.name, wakeup })) : [];
      })
      .sort((a, b) => a.wakeup.due - b.wakeup.due);
    return { at, about: { kind: "room", agents, wakeups } };
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
              failure: view.status.failure,
              wakeups: view.status.wakeups,
            },
      othersWorking: sessions?.filter((each) => each.working && each.id !== item.thread).length,
    },
  };
}

/** The person's devices, from the ways in the roster lists: each device's label and ID, in the roster's order. */
export function devicesOf(model: Pick<Model, "listing">): DevicesStatus["devices"] {
  return (model.listing?.ways ?? []).filter((way) => way.kind === "device").map((way) => ({ label: way.label, id: way.id }));
}
