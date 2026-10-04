import { type Context, defineService } from "@earendil-works/chord";

/** What a program says about itself when it registers. */
export interface Announcement {
  kind: "agent" | "chat";
  serverId: string;
  /** Absolute path of the program's Unix socket. */
  socket: string;
  pid: number;
  /**
   * The version of Shrimpy the program runs. Programs upgrade together, so this
   * is how a mismatch between peers gets reported. The gateway lists it and
   * never refuses a program for it.
   */
  version: string;
}

/** A program other programs can reach on this machine, as the gateway lists it. */
export interface Registration extends Announcement {
  /** An agent's name as the roster has it now, or `chat` for the chat server. */
  name: string;
  /** The member an agent is. The chat server is a program and not a member, so it has none. */
  memberId: string | null;
}

/** Which program a ticket is for. */
export type ProgramName = Pick<Registration, "kind" | "name">;

/** Someone on the network: a person or an agent. */
export interface Member {
  /** Minted once, when the member is made. It means nothing and never changes. */
  id: string;
  kind: "person" | "agent";
  /**
   * What the member is called: a label the roster binds to the ID. It can change.
   * No two members have the same name, whatever the case, so `@name` means one member.
   */
  name: string;
}

/** A member as the roster lists it. */
export interface RosterEntry extends Member {
  /** Whether a program is registered as this member now. */
  reachable: boolean;
}

/**
 * Connection scope: finding the programs that are running and knowing who is
 * on the network. The gateway only connects things; it never holds an agent's
 * home, its work or a conversation.
 *
 * Nobody says who they are: a connection that signed in with an agent's token
 * is that agent, and one that did not, on the gateway's own socket, is the
 * person who runs the gateway.
 */
export interface Gateway {
  /**
   * Announce this program. The registration lasts as long as this connection.
   * An agent registers as the member this connection signed in as, and is
   * refused if it did not sign in. The chat server registers as itself and is
   * not a member, so it does not sign in. Only a program on the gateway's
   * machine can register: a connection that came through the browser entry is
   * refused.
   */
  register(announcement: Announcement, context: Context): Promise<void>;
  list(context: Context): Promise<Registration[]>;
  /**
   * The version of Shrimpy the gateway runs, so that whoever talks through it
   * can tell when they were not built together. Like a registration's version,
   * it is reported and never refused.
   */
  version(context: Context): Promise<string>;

  /**
   * Make a new agent member called `name` that is recognized by `token`, and be
   * it from now on. The caller made the token and keeps it, and shows it only to
   * the gateway, which keeps a hash of it and never the token. A caller that
   * never heard the answer joins again with the same token and is the same
   * member: when the roster already has the member that holds the token, this
   * is that member, renamed to `name` if it is not called that. A name another
   * member has, whatever the case, is refused. Only a program on the gateway's
   * machine can join.
   */
  join(name: string, token: string, context: Context): Promise<Member>;
  /**
   * Be the member that holds `token` from now on. With a `name` that is not the
   * member's, the member is renamed first, and a name another member has is
   * refused. With null the roster's name stands. A token the roster does not
   * have is refused. Only a program on the gateway's machine can sign in.
   */
  signIn(token: string, name: string | null, context: Context): Promise<Member>;
  /** Everyone on the roster, oldest first. It carries no token and no socket. */
  members(context: Context): Promise<RosterEntry[]>;

  /**
   * A ticket for one program, to hand to it so that it can ask who the caller
   * is. The caller is the member this connection signed in as, or the person who
   * runs the gateway when it did not sign in. A ticket is good once, for a short
   * time, and for `target` only, which must be registered. Today the only
   * target is the chat server. Only a program on the gateway's machine can ask.
   */
  ticket(target: ProgramName, context: Context): Promise<string>;
  /**
   * Whose a ticket is, as the roster has the member now. Only the registered
   * program the ticket was made for can ask, and a ticket answers once.
   */
  redeem(ticket: string, context: Context): Promise<Member>;
}
export const Gateway = defineService<Gateway>("shrimpy.gateway");
