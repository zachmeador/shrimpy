import type { Member } from "../../contracts/chat/index.ts";
import { createLiveRoster, type LiveRoster, type RosterEntry } from "../../contracts/gateway/index.ts";

/** Who members are now, as the operations of chat ask it. */
export interface Identity {
  /** The member with this ID as the roster has it now, or undefined when it has none. */
  member(id: string): Member | undefined;
  /** The admins as the roster has them now. */
  admins(): Member[];
}

/** The roster as the chat server holds it, followed live, and who members are by it. */
export type LiveIdentity = Identity & LiveRoster;

const toMember = ({ id, kind, name }: RosterEntry): Member => ({ id, kind, name });

/**
 * The roster, unknown until `follow` holds it. The hold goes up the chat
 * server's link to the gateway, and keeps its last value while the link is
 * down, which is also when nobody can reach chat.
 */
export function createIdentity(onError: (error: Error) => void): LiveIdentity {
  const roster = createLiveRoster(onError);
  const entries = (): readonly RosterEntry[] => roster.now()?.members ?? [];
  return {
    ...roster,
    member(id) {
      const entry = entries().find((each) => each.id === id);
      return entry === undefined ? undefined : toMember(entry);
    },
    admins: () => entries().filter((entry) => entry.admin).map(toMember),
  };
}
