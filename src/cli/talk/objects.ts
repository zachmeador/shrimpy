import { ChordError, type Host, type Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context, withAbortSignal } from "@earendil-works/chord/context";
import type { Agent, Session } from "../../contracts/agent/index.ts";
import { Channel, Thread } from "../../contracts/chat/index.ts";
import { type Answer, type Principal, type Refused, type Revocation, Roster } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";

/** A host that holds the other programs' objects: a command's link to the gateway, or to an agent's home. */
export type Holder = { readonly host: Host<Principal, Revocation> };

/** A thread a command holds. */
export type HeldThread = Reference<typeof Thread>;
/** An agent a command holds. */
export type HeldAgent = Reference<typeof Agent>;
/** A session a command holds. */
export type HeldSession = Reference<typeof Session>;

/** What a method did, or its refusal, thrown as a `Refusal` with its words. */
export function valueOf<T>(answer: Answer<T>): T {
  if (answer.kind === "refused") refuse(answer.words);
  return answer.value;
}

/** Throw the refusal an object is held with, if it has one. */
export function unlessRefused(refusal: Refused | null): void {
  if (refusal !== null) refuse(refusal.words);
}

/** Whether `error` is a call that failed because its link dropped, or because the program it went to went away. */
export function isLost(error: unknown): boolean {
  return error instanceof ChordError && (error.code === "unavailable" || error.code === "released");
}

/** The context a command's calls run in: aborted by `signal`, when there is one. */
export const contextOf = (signal?: AbortSignal): Context =>
  signal === undefined ? BACKGROUND_CONTEXT : withAbortSignal(signal, BACKGROUND_CONTEXT);

/** Run `work` on the object `get` gives, for as long as it runs. */
export async function holding<T, O extends { release(): void }>(get: Promise<O>, work: (held: O) => Promise<T> | T): Promise<T> {
  const held = await get;
  try {
    return await work(held);
  } finally {
    held.release();
  }
}

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

/** The thread `id`, as `holder` has it, for as long as `work` runs. It is refused as chat refuses it. */
export function onThread<T>(holder: Holder, id: string, work: (thread: Reference<typeof Thread>) => Promise<T> | T, signal?: AbortSignal): Promise<T> {
  return holding(holder.host.get(Thread, { thread: id }, contextOf(signal)), (thread) => {
    unlessRefused(thread.refusal.value);
    return work(thread);
  });
}
