import type { Held, Host } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import { type Member, type Principal, type Revocation, Roster, type RosterEntry } from "../../contracts/gateway/index.ts";
import { createListeners, untilHeard } from "../../lib/listeners/index.ts";

/** The roster as the agent holds it at the gateway, followed live. */
export interface LiveRoster {
  /** Everyone on the roster, oldest first, and the agent itself, or undefined until the agent first heard them. */
  now(): { members: readonly RosterEntry[]; you: Member } | undefined;
  /** Resolves once the roster is known. Rejects when `signal` aborts first. */
  known(signal?: AbortSignal): Promise<void>;
  /** Be told after each change of who is on the roster, what each is called and who is an admin. */
  subscribe(listener: () => void): () => void;
  /** Hold the roster at the gateway through `host`, once it has loaded, and follow it from then on. */
  follow(host: Host<Principal, Revocation>, context: Context): void;
  /** Let go of the roster. */
  close(): void;
}

/**
 * The roster, unknown until `follow` holds it. The hold goes up the agent's link
 * to the gateway, as the agent, so `you` is the agent; it waits while the link is
 * down and keeps its last value meanwhile. Whether a member is reachable is no
 * change here.
 */
export function createRoster(onError: (error: Error) => void): LiveRoster {
  let entries: readonly RosterEntry[] | undefined;
  let self: Member | undefined;
  /** What the agent reads of the roster, as text: whether a member is reachable is none of it. */
  let read: string | undefined;
  let held: Held<typeof Roster> | undefined;
  const watches: { stop(): unknown }[] = [];
  let closed = false;
  const changed = createListeners<undefined>(onError);

  const take = (): void => {
    if (entries === undefined || self === undefined) return;
    const text = JSON.stringify([self, entries.map(({ id, kind, name, admin }) => [id, kind, name, admin])]);
    if (text === read) return;
    read = text;
    changed.notify(undefined);
  };

  return {
    now: () => (entries === undefined || self === undefined ? undefined : { members: entries, you: self }),
    known(signal) {
      if (entries !== undefined && self !== undefined) return Promise.resolve();
      return untilHeard((heard) => changed.add(() => heard()), signal);
    },
    subscribe: (listener) => changed.add(listener),
    follow(host, context) {
      if (held !== undefined || closed) return;
      const roster = host.hold(Roster, {}, context);
      held = roster;
      // A watch waits for the first value, so the roster is unknown until the gateway's first answer.
      void roster.members.watch(context).then(
        (watch) => {
          if (closed) return void watch.stop();
          watches.push(watch);
          entries = watch.value;
          take();
          watch.start(async (call) => {
            if (call.kind !== "value") return;
            entries = call.value;
            take();
          });
        },
        () => undefined,
      );
      void roster.you.watch(context).then(
        (watch) => {
          if (closed) return void watch.stop();
          watches.push(watch);
          self = watch.value ?? undefined;
          take();
          watch.start(async (call) => {
            if (call.kind !== "value") return;
            self = call.value ?? undefined;
            take();
          });
        },
        () => undefined,
      );
    },
    close() {
      closed = true;
      for (const watch of watches.splice(0)) void watch.stop();
      held?.release();
      changed.clear();
    },
  };
}
