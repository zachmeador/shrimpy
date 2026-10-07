import { type Context, defineService } from "@earendil-works/chord";

/** Where something is reached over the network. */
export interface Address {
  /** An IP address or a name. An IPv6 address is written without brackets. */
  host: string;
  /** A port from 1 to 65535. Asking the gateway to listen on 0 has it pick one, and it says which. */
  port: number;
}

/** What a program says about itself when it registers. */
export interface Announcement {
  kind: "agent" | "chat";
  /** The server ID the program answers as. A client needs it to speak to the program, and gets it with its ticket. */
  serverId: string;
  /**
   * Absolute path of the Unix socket the gateway pipes connections to. Only the
   * gateway is told: the gateway's list never shows it, and a client reaches the
   * program through the gateway by its name. An agent apart from the gateway,
   * which came in over its entry, has none and must say none: the gateway
   * can't dial a socket on another machine or under another user, and one it
   * could dial would let the agent point the gateway at any socket it can open.
   * It is called instead, and connects out (see `Gateway.calls`). A program on
   * the gateway's machine must give one.
   */
  socket?: string;
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
  /**
   * Whether the member is an admin, the one role the roster records, as the
   * roster has it now. Every person is one, and an agent is one only once it
   * has been promoted. What needs an admin is for each program to say.
   */
  admin: boolean;
}

/** A member as the roster lists it. */
export interface RosterEntry extends Member {
  /** Whether a program is registered as this member now. */
  reachable: boolean;
}

/** What lets an agent, or a machine of a person's own, in from apart: a code, and where to take it. */
export interface Invitation {
  /**
   * Written like `K7Q2-9FXD`: eight letters and digits that can't be mistaken
   * for one another, read without regard to case or the hyphen. It is good
   * once, for fifteen minutes, and for what it was asked for only: the name of
   * an agent, or a machine of the person who asked.
   */
  code: string;
  /** The addresses the gateway listens on, which the agent or machine connects to. There is at least one: with none, no invitation is made. */
  addresses: Address[];
  /** When the code stops being good, in milliseconds since the epoch. */
  expires: number;
}

/** An invitation for a machine of a person's own, with the person it lets the machine in as. */
export interface MachineInvitation extends Invitation {
  /** The person who asked, and who the machine is from then on. */
  person: Member;
}

/**
 * Connection scope: finding the programs that are running, knowing who is on
 * the network, and being let in to a program. The gateway only connects things;
 * it never holds an agent's home, its work or a conversation.
 *
 * Nobody says who they are: a connection that signed in with an agent's token
 * is that agent, one that signed in with the token a machine of the person's
 * own keeps is that person, and one that did not, on the gateway's own socket,
 * is the person who runs the gateway.
 *
 * A connection over the gateway's network entry, which is "the entry" below, is
 * apart from the gateway: it comes from another machine, another user or a
 * container. Until it has signed in or joined it is nobody and can do nothing
 * else: it can't list, read the roster, ask for the version or a ticket,
 * register, ask for calls or invite. Once it has, it is that agent and may do
 * what an agent on the gateway's machine may, or, if it showed a machine's
 * token, it is the person and may do all that the person may, which is not to
 * register a program or to be renamed: a machine is no program. A page in a
 * browser that came through the browser entry may list the programs and the
 * roster, and nothing else.
 *
 * The roster also records who is an admin. The gateway checks it for what the
 * roster is: who may promote and demote. Every other program that has
 * something that takes an admin asks the roster for it and checks for itself.
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
   * member, so it does not sign in. A program on the gateway's machine registers
   * with the socket it listens on. A connection over the entry registers as an
   * agent with no socket, and is refused if it gives one: the gateway can't
   * dial an agent that is apart from it, so it lists it as running, and when
   * someone asks for it, makes a call for it and waits for the agent to answer
   * (see `calls`). A connection that came through the browser entry can't
   * register, and neither can the person on a machine of theirs: a machine is no
   * program. A connection over the entry can die with no word, so the gateway
   * pings it and lets go of it once it has answered none for half a minute,
   * which takes the registration away: an agent that lost its network is listed
   * as running for no longer than that, and registers again when it is back.
   */
  register(announcement: Announcement, context: Context): Promise<void>;
  /**
   * Who wants this agent: the IDs of the calls the gateway has made for it since
   * it last asked, oldest first, waiting until there is one. The gateway makes a
   * call when a client asks to be connected to an agent that registered with no
   * socket, since it can't dial one, and the client's connection waits at the
   * gateway meanwhile. The agent answers a call by opening one more connection
   * to the gateway's network entry, at the path `answerPath` makes of the ID,
   * and joining it to its own server. The gateway joins that connection to the
   * client's, and reads none of the bytes that pass after that.
   *
   * A call's ID can't be guessed and is good once, for fifteen seconds from
   * when the call was made, whether or not the agent was told of it. One the
   * agent doesn't answer in time ends the client's connection, and so does the
   * agent's registration ending. A call made while the agent isn't asking waits
   * for it, for as long as it is good. Only the connection that is registered
   * as the agent, with no socket, is told of its calls, and any other is
   * refused. Cancelling this request ends the wait.
   */
  calls(context: Context): Promise<string[]>;
  list(context: Context): Promise<Registration[]>;
  /**
   * The version of Shrimpy the gateway runs, so that whoever talks through it
   * can tell when they were not built together. Like a registration's version,
   * it is reported and never refused. It is also the smallest thing to ask, so
   * a program that has to know whether the gateway still answers asks this.
   */
  version(context: Context): Promise<string>;

  /**
   * An invitation for an agent called `name` to join from apart. Only a person
   * or an admin may ask, and anyone else is refused with the reason
   * `NEEDS_ADMIN`. A name another member has, whatever the case, is refused. So
   * is asking while the gateway listens on no address for agents apart from
   * it, since nobody could use the invitation. The gateway keeps the code in
   * memory only, so one that was not used is gone when it restarts.
   */
  invite(name: string, context: Context): Promise<Invitation>;
  /**
   * An invitation for a machine of the caller's own to join from apart, which
   * is the caller from then on. Only a person may ask, on the gateway's own
   * socket or over the entry from a machine of theirs that is in already, and
   * it is for the person who asks. No agent may, an admin included, since
   * whoever uses the invitation is let in as the person: an agent is refused,
   * with the reason `service_not_allowed` and a message that says why. The
   * answer says who the machine will be. It is made, kept and refused as
   * `invite`'s is, and a machine is let in with it by `joinMachine`.
   */
  inviteMachine(context: Context): Promise<MachineInvitation>;
  /**
   * Make a new agent member called `name` that is recognized by `token`, and be
   * it from now on. The caller made the token and keeps it, and shows it only to
   * the gateway, which keeps a hash of it and never the token. A caller that
   * never heard the answer joins again with the same token and is the same
   * member: when the roster already has the member that holds the token, this
   * is that member, renamed to `name` if it is not called that. A name another
   * member has, whatever the case, is refused. So is joining, under any name,
   * with the token of a member that a program on another connection is
   * registered as.
   *
   * A program on the gateway's machine joins with a `code` of null, and the
   * gateway does not look at one. A connection over the entry gives the code of
   * an invitation for `name`, which is used up when it makes the member. A code
   * the gateway never made, that was used, that ran out or that is for another
   * name is refused, and so is none. A caller that never heard the answer joins
   * again with the same token and code and is the same member: the roster has
   * the token already, so the code is not asked for again. After five wrong
   * codes on one connection every further join on it is refused. A page in a
   * browser can't join.
   */
  join(name: string, token: string, code: string | null, context: Context): Promise<Member>;
  /**
   * Make a machine of the person the invitation `code` is for, and be that
   * person from now on, as a machine of theirs is. The caller made the token
   * and keeps it, and shows it only to the gateway, which keeps a hash of it
   * with the person's record, beside how the person is recognized on the
   * gateway's own machine, and never the token. A machine joins over the entry
   * only, with the code of an invitation that `inviteMachine` made: one the
   * gateway never made, that was used, that ran out or that is for an agent is
   * refused. A machine that never heard the answer joins again with the same
   * token and code and is let in: the roster has the token already, so the
   * code is not asked for again. Wrong codes are counted as `join` counts
   * them: after five on one connection every join on it is refused. A page in
   * a browser can't join.
   */
  joinMachine(token: string, code: string, context: Context): Promise<Member>;
  /**
   * Be the member that holds `token` from now on: the agent, or the person whose
   * machine keeps it. With a `name` that is not an agent's, the agent is renamed
   * first, and a name another member has is refused. So is a rename while a
   * program on another connection is registered as the agent. A person is never
   * renamed, so a name that is not the person's is refused for a machine's
   * token. With null, or the member's own name, nothing changes, and the member
   * is signed in as. A token the roster does not have is refused. A page in a
   * browser can't sign in.
   */
  signIn(token: string, name: string | null, context: Context): Promise<Member>;
  /** Everyone on the roster, oldest first. It carries no token and no socket. */
  members(context: Context): Promise<RosterEntry[]>;
  /**
   * Make the agent `memberId` an admin, and answer with it as it now is. An
   * agent that is one already stays one. Only a person or an admin may, and
   * anyone else is refused with the reason `NEEDS_ADMIN`. A person is an admin
   * already, so a person is refused too. A page in a browser can't.
   */
  promote(memberId: string, context: Context): Promise<Member>;
  /**
   * Make the admin agent `memberId` an ordinary agent again, by the same rules
   * as `promote`. An agent that is not an admin stays as it is. A person can't
   * be demoted.
   */
  demote(memberId: string, context: Context): Promise<Member>;

  /**
   * A ticket for one program, to hand to it so that it can ask who the caller
   * is, with the server ID the program answers as. A client connects to a
   * program through the gateway by its name, and the ticket is the first thing
   * it hands over. The caller is the member this connection signed in as, or the
   * person who runs the gateway when it did not sign in, on the gateway's own
   * socket. A ticket is good once, for a short time, and for `target` only,
   * which must be registered. It is made the same for an agent apart from the
   * gateway, which asks the gateway whose it is over the connection it is
   * registered on, so what the agent lets the caller do is the agent's rule, as
   * it is for an agent beside the gateway. A page in a browser can't ask.
   */
  ticket(target: ProgramName, context: Context): Promise<Ticket>;
  /**
   * Whose a ticket is, as the roster has the member now. Only the registered
   * program the ticket was made for can ask, and a ticket answers once.
   */
  redeem(ticket: string, context: Context): Promise<Member>;
}
export const Gateway = defineService<Gateway>("shrimpy.gateway");
