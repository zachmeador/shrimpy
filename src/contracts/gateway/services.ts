import { type Context, defineService } from "@earendil-works/chord";

/** What a program says about itself when it registers. */
export interface Announcement {
  kind: "agent" | "chat";
  /** The server ID the program answers as. A client needs it to speak to the program, and gets it with its ticket. */
  serverId: string;
  /**
   * Absolute path of the Unix socket the gateway pipes connections to. Only the
   * gateway is told: the gateway's list never shows it, and a client reaches the
   * program through the gateway by its name.
   */
  socket: string;
  /**
   * The version of Shrimpy the program runs. Programs upgrade together, so this
   * is how a mismatch between peers gets reported. The gateway lists it and
   * never refuses a program for it.
   */
  version: string;
}

/** A program other programs can reach through the gateway, as the gateway lists it. */
export interface Registration {
  kind: Announcement["kind"];
  /** An agent's name as the roster has it now, or `chat` for the chat server. */
  name: string;
  /** The member an agent is. The chat server is a program and not a member, so it has none. */
  memberId: string | null;
  version: Announcement["version"];
}

/** A program is reached by its name. */
export type ProgramName = Pick<Registration, "kind" | "name">;

/** What a client is given to be let in to a program. */
export interface Ticket {
  /**
   * To hand to the program, which asks the gateway whose it is. It is good
   * once, for a short time, and for that program only.
   */
  value: string;
  /** The server ID the program answers as, which the client needs to speak to it. */
  serverId: string;
}

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
 * Connection scope: finding the programs that are running, knowing who is on
 * the network, and being let in to a program. The gateway only connects things;
 * it never holds an agent's home, its work or a conversation.
 *
 * Nobody says who they are: a connection that signed in with an agent's token
 * is that agent, and one that did not, on the gateway's own socket, is the
 * person who runs the gateway.
 *
 * An agent runs once. A copy of an agent's home holds the same token, so while a
 * program is registered as a member, a program on another connection that joins
 * with the member's token, renames the member with it or registers as the member
 * is refused. The agent that is running keeps its name and stays the one that is
 * reached, and the token is let in again once that connection has ended. Signing
 * in without a rename is let in, so a command run in an agent's shell can act as
 * the agent. A refusal that an agent answers with advice of its own says which
 * case it is, in its reason (see `TURNED_AWAY`), and its message says only what
 * happened: the gateway knows nothing of the files in an agent's home.
 */
export interface Gateway {
  /**
   * Announce this program. The registration lasts as long as this connection.
   * An agent registers as the member this connection signed in as, and is
   * refused if it did not sign in, or if a program on another connection is
   * registered as that member. The chat server registers as itself and is not a
   * member, so it does not sign in. Only a program on the gateway's machine can
   * register: a connection that came through the browser entry is refused.
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
   * member has, whatever the case, is refused. So is joining, under any name,
   * with the token of a member that a program on another connection is
   * registered as. Only a program on the gateway's machine can join.
   */
  join(name: string, token: string, context: Context): Promise<Member>;
  /**
   * Be the member that holds `token` from now on. With a `name` that is not the
   * member's, the member is renamed first, and a name another member has is
   * refused. So is a rename while a program on another connection is registered
   * as the member. With null, or the member's own name, nothing changes, and the
   * member is signed in as. A token the roster does not have is refused. Only a
   * program on the gateway's machine can sign in.
   */
  signIn(token: string, name: string | null, context: Context): Promise<Member>;
  /** Everyone on the roster, oldest first. It carries no token and no socket. */
  members(context: Context): Promise<RosterEntry[]>;

  /**
   * A ticket for one program, to hand to it so that it can ask who the caller
   * is, with the server ID the program answers as. A client connects to a
   * program through the gateway by its name, and the ticket is the first thing
   * it hands over. The caller is the member this connection signed in as, or the
   * person who runs the gateway when it did not sign in. A ticket is good once,
   * for a short time, and for `target` only, which must be registered. Only a
   * program on the gateway's machine can ask.
   */
  ticket(target: ProgramName, context: Context): Promise<Ticket>;
  /**
   * Whose a ticket is, as the roster has the member now. Only the registered
   * program the ticket was made for can ask, and a ticket answers once.
   */
  redeem(ticket: string, context: Context): Promise<Member>;
}
export const Gateway = defineService<Gateway>("shrimpy.gateway");
