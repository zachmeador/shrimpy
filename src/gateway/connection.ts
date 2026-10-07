import {
  type Address,
  type Gateway,
  type Member,
  type ProgramName,
  refuseNeedsAdmin,
  TURNED_AWAY,
} from "../contracts/gateway/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import type { Calls } from "./calls/index.ts";
import type { Invitations } from "./invitations/index.ts";
import { checkAnnouncement, InvalidRegistrationError, type Registry } from "./registry/index.ts";
import type { Roster } from "./roster/index.ts";
import type { Tickets } from "./tickets/index.ts";
import type { Ways } from "./ways/index.ts";

/** What every connection to the gateway shares. */
export interface GatewayDeps {
  roster: Roster;
  registry: Registry;
  tickets: Tickets;
  invitations: Invitations;
  /** The calls made for agents that registered with no socket, which they are told of over the connection they registered on. */
  calls: Calls;
  /** The ways in to the programs that are registered, kept to match the registry. */
  ways: Ways;
  /** The operating system user who runs the gateway, which is who a connection on its own socket that signed in as nobody is. */
  osUser: string;
  /** The addresses the network entry listens on now, which are none while it is not open. */
  addresses(): Address[];
  /** Told of what goes wrong that belongs to no call. */
  onError(error: Error): void;
}

/**
 * Who is on the other end: a program on this machine, a page that came through
 * the browser entry, or a connection that came over the network entry, which
 * is apart from the gateway: another machine, another user or a container.
 */
export type Peer = "program" | "browser" | "apart";

/** The wrong codes one connection may give before every join on it is refused. */
const WRONG_CODES = 5;

const CODE_USED = "That invitation was used already. An invitation is good once, so ask for a new one.";

/** What one connection to the gateway is: its `Gateway`, and how to let go of what it leaves behind. */
export interface ServedGateway {
  readonly gateway: Gateway;
  /** The connection is over: its registration goes with it. */
  end(): void;
}

/**
 * The `Gateway` one connection talks to. The connection holds who it signed in
 * as, what it registered and how many wrong codes it gave, and nothing else in
 * the gateway remembers a connection: a registration lasts as long as the
 * connection that made it.
 */
export function serveGateway(deps: GatewayDeps, peer: Peer): ServedGateway {
  const { roster, registry, tickets, invitations, calls, ways } = deps;
  const registrant = peer === "browser" ? undefined : registry.connect();
  let signedIn: string | undefined;
  let registered: ProgramName | undefined;
  let wrongCodes = 0;

  /** A page in a browser lists what is running and who is on the roster, and does nothing else. */
  const notForBrowsers = (what: string): void => {
    if (peer !== "browser") return;
    refuse(
      `A browser can't ${what}. It can list what is running and who is on the roster.`,
      "service_not_allowed",
    );
  };

  /** A connection from apart does nothing until it has signed in or joined: nobody has said who it is. */
  const signedInIfApart = (what: string): void => {
    if (peer !== "apart" || signedIn !== undefined) return;
    refuse(`Sign in with the agent's token, or join with an invitation, before this connection can ${what}.`, "service_not_allowed");
  };

  /**
   * The person who runs the gateway, which a connection on its own socket is
   * until it signs in. Nothing over the network is, until it shows the token of
   * a machine of the person's own, which signs it in as the person.
   */
  const person = (): Member | undefined => (peer === "program" ? roster.person(deps.osUser) : undefined);

  /** Who this connection is: the member it signed in as, or on the gateway's own socket the person who runs it. */
  const caller = (): Member =>
    (signedIn === undefined ? person() : roster.member(signedIn)) ??
    refuse("The gateway has no member for this connection.");

  const admins = (): Member[] => roster.members().filter((member) => member.admin);

  /** Who a connection is cannot change under a registration that was made as someone. */
  const beforeRegistering = (what: string): void => {
    if (registered !== undefined) refuse(`This connection has registered already, so it can't ${what}.`);
  };

  /**
   * An agent runs once, and a copy of its home holds its token. While a program
   * on another connection is registered as the member, joining with the token,
   * renaming the member with it and registering as the member are refused, so
   * that the copy changes nothing and the agent that runs stays the one reached.
   * What to do about it depends on files in the agent's home, which the agent
   * says; the message here says what happened.
   */
  const refuseIfRunning = (member: Member): void => {
    if (!registry.registeredAs(member.id, registrant)) return;
    refuse(
      `The agent "${member.name}" is already running, and this connection holds its token, so the gateway takes it for the same agent.`,
      "service_not_allowed",
      TURNED_AWAY.agentRunning,
    );
  };

  /**
   * Make an agent an admin or an ordinary agent again, as the person who runs
   * the gateway or an admin asks. Whether the caller is one is read from the
   * roster now, so a promotion counts at once, on a connection that was made
   * before it.
   */
  const changeRole = (what: string, memberId: unknown, admin: boolean): Member => {
    notForBrowsers("promote or demote an agent");
    signedInIfApart("promote or demote an agent");
    const asking = caller();
    if (!asking.admin) refuseNeedsAdmin(what, asking, admins());
    const target = typeof memberId === "string" ? roster.member(memberId) : undefined;
    if (target === undefined) refuse(`There is no member ${String(memberId)} on the roster.`);
    return roster.setAdmin(target.id, admin);
  };

  /**
   * The invitation `code` gives `name`, not yet used up, or a refusal that says
   * what is wrong with the code. Every wrong code counts against the connection.
   */
  const invitationFor = (code: unknown, name: unknown) => {
    const checked = invitations.check(code, name);
    if (checked.ok) return checked;
    wrongCodes += 1;
    refuse(
      checked.why === "used"
        ? CODE_USED
        : `The gateway has no invitation like that for ${String(name)}. An invitation is good once, for fifteen minutes and for one name. Check the code, or ask for a new one.`,
    );
  };

  /** The invitation `code` gives a machine of a person's own, not yet used up, as `invitationFor` has it for an agent. */
  const machineInvitationFor = (code: unknown) => {
    const checked = invitations.checkForMachine(code);
    if (checked.ok) return checked;
    wrongCodes += 1;
    refuse(
      checked.why === "used"
        ? CODE_USED
        : "The gateway has no invitation like that for a machine of a person's own. An invitation is good once, for fifteen minutes and for what it was made for. Check the code, or ask for a new one.",
    );
  };

  /** A connection that has given too many wrong codes may not join, whatever it gives next. */
  const refuseIfGuessing = (): void => {
    if (wrongCodes < WRONG_CODES) return;
    refuse(
      `This connection has given ${String(WRONG_CODES)} wrong codes, so the gateway takes no more joins on it. Connect again with the right code, or ask for a new invitation.`,
      "service_not_allowed",
    );
  };

  /** Make the ways in match what is registered. A way that cannot be made is the caller's to be told of, not an internal error. */
  const openWays = async (): Promise<void> => {
    try {
      await ways.sync();
    } catch (error) {
      refuse(`The gateway could not open a way in to the program: ${(error as Error).message}`);
    }
  };

  const gateway: Gateway = {
    async register(announcement) {
      notForBrowsers("register");
      signedInIfApart("register");
      if (registrant === undefined) return;
      try {
        const checked = checkAnnouncement(announcement, peer === "apart");
        const member = signedIn === undefined ? undefined : roster.member(signedIn);
        // A person's machine is no program, whatever it announces.
        if (member?.kind === "person") {
          refuse(
            `${member.name} is a person, and a person's machine is no program, so it can't register one. Only an agent registers, as itself.`,
            "service_not_allowed",
          );
        }
        let memberId: string | null = null;
        if (checked.kind === "agent") {
          if (member === undefined) refuse("An agent registers as a member: join or sign in first.");
          refuseIfRunning(member);
          memberId = member.id;
        } else if (signedIn !== undefined) {
          refuse("Only an agent is a member. A program that is not one registers without signing in.");
        }
        const entry = registrant.register(checked, memberId);
        registered = { kind: entry.kind, name: entry.name };
      } catch (error) {
        if (error instanceof InvalidRegistrationError) refuse(error.message);
        throw error;
      }
      // The call ends once the program can be reached by its name, or else the program is not registered.
      try {
        await openWays();
      } catch (error) {
        registrant.close();
        registered = undefined;
        throw error;
      }
    },
    async calls(context) {
      notForBrowsers("ask for calls");
      signedInIfApart("ask for calls");
      // Only the connection an agent registered on with no socket is told of its calls, so nobody learns an ID that lets them in as the agent.
      const mine = registrant?.current();
      if (registrant === undefined || mine === undefined || mine.socket !== undefined) {
        refuse(
          "Only an agent that registered with no socket is told of calls: the gateway reaches any other program by its socket.",
          "service_not_allowed",
        );
      }
      return calls.next(registrant, context.abortSignal);
    },
    async list() {
      signedInIfApart("list what is running");
      return registry.list();
    },
    async version() {
      signedInIfApart("ask for the version");
      return SHRIMPY_VERSION;
    },

    async invite(name) {
      notForBrowsers("invite an agent");
      signedInIfApart("invite an agent");
      const asking = caller();
      if (!asking.admin) refuseNeedsAdmin("Inviting an agent", asking, admins());
      const addresses = deps.addresses();
      if (addresses.length === 0) {
        refuse(
          "This gateway listens on no address for an agent apart from it, so nobody could use an invitation. Start it with one.",
          "service_not_allowed",
        );
      }
      return { ...invitations.issue(roster.vacant(name)), addresses };
    },
    async inviteMachine() {
      notForBrowsers("invite a machine");
      signedInIfApart("invite a machine");
      const asking = caller();
      if (asking.kind !== "person") {
        const people = roster.members().filter((member) => member.kind === "person");
        refuse(
          `Only a person may invite a machine of their own, and ${asking.name} is an agent. Whoever uses that invitation is let in ` +
            `as the person, with everything the person may do, so no agent may ask for one, an admin included. Ask ${people.map((each) => each.name).join(" or ")}.`,
          "service_not_allowed",
        );
      }
      const addresses = deps.addresses();
      if (addresses.length === 0) {
        refuse(
          "This gateway listens on no address for a machine apart from it, so nobody could use an invitation. Start it with one.",
          "service_not_allowed",
        );
      }
      return { ...invitations.issueForMachine(asking.id), addresses, person: asking };
    },
    async join(name, token, code) {
      notForBrowsers("join");
      beforeRegistering("join");
      if (signedIn !== undefined) refuse(`This connection is already signed in as ${caller().name}.`);
      if (peer === "apart") {
        refuseIfGuessing();
        if (typeof code !== "string") {
          refuse("Joining from apart takes the code of an invitation. Ask the person who runs the gateway for one.");
        }
      }
      // The roster renames the member that holds the token, so whether it runs is checked first.
      const holder = typeof token === "string" ? roster.memberWithToken(token) : undefined;
      if (holder !== undefined) refuseIfRunning(holder);
      // The code is used up to make a member. The one that holds the token is made already, as a caller that never heard the answer finds.
      const invited = peer === "apart" && holder === undefined ? invitationFor(code, name) : undefined;
      const member = roster.join(name, token);
      invited?.spend();
      signedIn = member.id;
      return member;
    },
    async joinMachine(token, code) {
      notForBrowsers("join as a machine");
      if (signedIn !== undefined) refuse(`This connection is already signed in as ${caller().name}.`);
      if (peer !== "apart") {
        refuse(
          "A machine joins over the gateway's network entry. On the gateway's own socket you are the person who runs it already.",
          "service_not_allowed",
        );
      }
      refuseIfGuessing();
      // A machine that never heard the answer has its token on the roster already, and the code was used up for it.
      const known = typeof token === "string" ? roster.personWithMachine(token) : undefined;
      if (known !== undefined) {
        signedIn = known.id;
        return known;
      }
      if (typeof code !== "string") {
        refuse("Joining from apart takes the code of an invitation. Ask the person who runs the gateway for one.");
      }
      const invited = machineInvitationFor(code);
      const person = roster.addMachine(invited.person, token);
      invited.spend();
      signedIn = person.id;
      return person;
    },
    async signIn(token, name) {
      notForBrowsers("sign in");
      beforeRegistering("sign in");
      const member = typeof token === "string" ? (roster.memberWithToken(token) ?? roster.personWithMachine(token)) : undefined;
      if (member === undefined) {
        refuse(
          "The gateway does not know that token. It may belong to a roster that was replaced.",
          "service_invalid_value",
          TURNED_AWAY.unknownToken,
        );
      }
      if (signedIn !== undefined && signedIn !== member.id) {
        refuse(`This connection is already signed in as ${caller().name}.`);
      }
      const wanted: unknown = name;
      const named = wanted !== null && wanted !== undefined;
      if (member.kind === "person") {
        // A machine is a way to be the person, and no way to change who they are.
        if (named && wanted !== member.name) {
          refuse(`${member.name} is a person, and nothing renames a person, so a machine of theirs can't.`, "service_not_allowed");
        }
        signedIn = member.id;
        return member;
      }
      // Signing in without a rename changes nothing, so a command in the agent's shell can do it while the agent runs.
      if (named && wanted !== member.name) refuseIfRunning(member);
      const signed = named ? roster.rename(member.id, wanted as string) : member;
      signedIn = signed.id;
      // A rename moves the registrations of that member to the new name, and their ways in with them.
      if (signed.name !== member.name) await openWays();
      return signed;
    },
    async members() {
      signedInIfApart("read the roster");
      const running = new Set(registry.list().map((program) => program.memberId));
      return roster.members().map((member) => ({ ...member, reachable: running.has(member.id) }));
    },
    async promote(memberId) {
      return changeRole("Promoting an agent", memberId, true);
    },
    async demote(memberId) {
      return changeRole("Demoting an agent", memberId, false);
    },

    async ticket(target) {
      notForBrowsers("ask for a ticket");
      signedInIfApart("ask for a ticket");
      // A program that has just registered may not have its way in yet, and a ticket is for one that has.
      await openWays();
      const found = registry.find(target.kind, target.name);
      if (found === undefined) {
        refuse(
          `There is no ${target.kind === "chat" ? "chat server" : `${target.kind} called ${target.name}`} registered with the gateway, so there is nobody to give a ticket for.`,
        );
      }
      return {
        value: tickets.issue(caller().id, { kind: found.kind, name: found.name }),
        serverId: found.serverId,
      };
    },
    async redeem(ticket) {
      if (registered === undefined) refuse("Only a registered program can redeem a ticket.", "service_not_allowed");
      const result = tickets.redeem(ticket, registered);
      if (!result.ok) {
        refuse(
          result.why === "elsewhere"
            ? "That ticket was made for another program."
            : "That ticket is not good: it was used already, it expired, or the gateway never made it. Ask for a new one.",
        );
      }
      return roster.member(result.memberId) ?? refuse("The member that ticket was made for is no longer on the roster.");
    },
  };
  return {
    gateway,
    end() {
      registrant?.close();
      // The calls made for it have nobody left to answer them.
      if (registrant !== undefined) calls.end(registrant);
      // Its way in goes with it, unless another program has the same name.
      ways.sync().catch((error: unknown) => {
        deps.onError(error instanceof Error ? error : new Error(String(error)));
      });
    },
  };
}
