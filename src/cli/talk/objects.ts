import type { Host, Reference } from "@earendil-works/chord";
import type { Agent, Session } from "../../contracts/agent/index.ts";
import { Channel, type Thread } from "../../contracts/chat/index.ts";
import { contextOf, holding, type Principal, type Revocation, Roster, unlessRefused } from "../../contracts/gateway/index.ts";

/** A host that holds the other programs' objects: a command's link to the gateway, or to an agent's home. */
export type Holder = { readonly host: Host<Principal, Revocation> };

/** A thread a command holds. */
export type HeldThread = Reference<typeof Thread>;
/** An agent a command holds. */
export type HeldAgent = Reference<typeof Agent>;
/** A session a command holds. */
export type HeldSession = Reference<typeof Session>;

/** The channel `id`, as `holder` has it, for as long as `work` runs. It is refused as chat refuses it. */
export function onChannel<T>(holder: Holder, id: string, work: (channel: Reference<typeof Channel>) => Promise<T> | T, signal?: AbortSignal): Promise<T> {
  return holding(holder.host.get(Channel, { channel: id }, contextOf(signal)), (channel) => {
    unlessRefused(channel.refusal.value);
    return work(channel);
  });
}

/** The roster as `holder` sees it, for as long as `work` runs. */
export function onRoster<T>(holder: Holder, work: (roster: Reference<typeof Roster>) => Promise<T> | T, signal?: AbortSignal): Promise<T> {
  return holding(holder.host.get(Roster, {}, contextOf(signal)), work);
}
