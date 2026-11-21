import type { Held, Host } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import type { WatchHandle } from "@earendil-works/chord/watch";
import { createListeners, untilHeard } from "../../lib/listeners/index.ts";
import type { Principal, Revocation } from "./principals.ts";
import { type Member, Roster, type RosterEntry } from "./roster.ts";

/** The roster as a program holds it now: everyone on it, oldest first, and the member the program is, or null for one that is no member. */
export interface RosterNow {
  readonly members: readonly RosterEntry[];
  readonly you: Member | null;
}

/** The roster as a program holds it at the gateway, followed live. */
export interface LiveRoster {
  /** The roster as the program last heard it, or undefined until it first heard it. */
  now(): RosterNow | undefined;
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
 * The roster, unknown until `follow` holds it and the gateway first answers.
 * The hold goes up the program's own link to the gateway, so `you` is the
 * program: an agent, or nobody for the chat server. It waits while the link is
 * down and keeps its last value meanwhile. Whether a member is reachable is no
 * change here.
 */
export function createLiveRoster(onError: (error: Error) => void): LiveRoster {
  let members: readonly RosterEntry[] | undefined;
  let you: Member | null | undefined;
  /** What a program reads of the roster, as text: whether a member is reachable is none of it. */
  let read: string | undefined;
  let currentHost: Host<Principal, Revocation> | undefined;
  let held: Held<typeof Roster> | undefined;
  const watches: { stop(): unknown }[] = [];
  let closed = false;
  const changed = createListeners<undefined>(onError);

  const now = (): RosterNow | undefined => (members === undefined || you === undefined ? undefined : { members, you });

  const take = (): void => {
    const current = now();
    if (current === undefined) return;
    const text = JSON.stringify([current.you, current.members.map(({ id, kind, name, admin }) => [id, kind, name, admin])]);
    if (text === read) return;
    read = text;
    changed.notify(undefined);
  };

  /** Follow one member of `owner`, from its first value, which a watch waits for. */
  const watching = <T>(
    owner: Held<typeof Roster>,
    member: { watch(context: Context): Promise<WatchHandle<T>> },
    set: (value: T) => void,
    context: Context,
  ): void => {
    void member.watch(context).then(
      (watch) => {
        if (closed || held !== owner) return void watch.stop();
        watches.push(watch);
        set(watch.value);
        take();
        watch.start(async (call) => {
          if (call.kind !== "value" || held !== owner) return;
          set(call.value);
          take();
        });
      },
      () => undefined,
    );
  };

  return {
    now,
    known(signal) {
      if (now() !== undefined) return Promise.resolve();
      return untilHeard((heard) => changed.add(() => heard()), signal);
    },
    subscribe: (listener) => changed.add(listener),
    follow(host, context) {
      if (closed || currentHost === host) return;
      currentHost = host;
      for (const watch of watches.splice(0)) void watch.stop();
      held?.release();
      const roster = host.hold(Roster, {}, context);
      held = roster;
      watching(roster, roster.members, (value) => void (members = value), context);
      watching(roster, roster.you, (value) => void (you = value), context);
    },
    close() {
      closed = true;
      currentHost = undefined;
      for (const watch of watches.splice(0)) void watch.stop();
      held?.release();
      held = undefined;
      changed.clear();
    },
  };
}
