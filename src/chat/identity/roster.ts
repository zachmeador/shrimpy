import type { Host, Held } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { Member } from "../../contracts/chat/index.ts";
import { type Principal, type Revocation, Roster, type RosterEntry } from "../../contracts/gateway/index.ts";
import { createListeners, untilHeard } from "../../lib/listeners/index.ts";

/** Who members are now, as the operations of chat ask it. */
export interface Identity {
  /** The member with this ID as the roster has it now, or undefined when it has none. */
  member(id: string): Member | undefined;
  /** The admins as the roster has them now. */
  admins(): Member[];
}

/** The roster as the chat server holds it, followed live. */
export interface LiveIdentity extends Identity {
  /** Everyone on the roster now, oldest first, or undefined until the chat server first heard it. */
  members(): readonly Member[] | undefined;
  /** Resolves once the roster is known. Rejects when `signal` aborts first. */
  known(signal?: AbortSignal): Promise<void>;
  /** Be told after each change of the roster. */
  subscribe(listener: () => void): () => void;
  /** Hold the roster at the gateway through `host`, once it has loaded, and follow it from then on. */
  follow(host: Host<Principal, Revocation>, context: Context): void;
  /** Let go of the roster. */
  close(): void;
}

const toMember = ({ id, kind, name }: RosterEntry): Member => ({ id, kind, name });

/**
 * The roster, unknown until `follow` holds it. The hold goes up the chat
 * server's link to the gateway, and keeps its last value while the link is
 * down, which is also when nobody can reach chat.
 */
export function createIdentity(onError: (error: Error) => void): LiveIdentity {
  let entries: readonly RosterEntry[] | undefined;
  /** What the chat server reads of the roster, as text: whether a member is reachable is none of it. */
  let read: string | undefined;
  let held: Held<typeof Roster> | undefined;
  let watching: WatchHandle<RosterEntry[]> | undefined;
  let closed = false;
  const changed = createListeners<undefined>(onError);

  const take = (next: readonly RosterEntry[]): void => {
    const text = JSON.stringify(next.map(({ id, kind, name, admin }) => [id, kind, name, admin]));
    entries = next;
    if (text === read) return;
    read = text;
    changed.notify(undefined);
  };

  return {
    member(id) {
      const entry = entries?.find((each) => each.id === id);
      return entry === undefined ? undefined : toMember(entry);
    },
    admins: () => (entries ?? []).filter((entry) => entry.admin).map(toMember),
    members: () => entries?.map(toMember),
    known(signal) {
      if (entries !== undefined) return Promise.resolve();
      return untilHeard((heard) => changed.add(() => heard()), signal);
    },
    subscribe: (listener) => changed.add(listener),
    follow(host, context) {
      if (held !== undefined || closed) return;
      const roster = host.hold(Roster, {}, context);
      held = roster;
      // A watch waits for the first value, so the roster is unknown until the gateway's first answer.
      roster.members.watch(context).then(
        (watch) => {
          if (closed) return void watch.stop();
          watching = watch;
          take(watch.value);
          watch.start(async (call) => {
            if (call.kind === "value") take(call.value);
          });
        },
        () => undefined,
      );
    },
    close() {
      closed = true;
      void watching?.stop();
      held?.release();
      changed.clear();
    },
  };
}
