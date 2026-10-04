import type { Gateway, Member, ProgramName } from "../contracts/gateway/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { checkAnnouncement, InvalidRegistrationError, type Registry } from "./registry/index.ts";
import type { Roster } from "./roster/index.ts";
import type { Tickets } from "./tickets/index.ts";
import type { Ways } from "./ways/index.ts";

/** What every connection to the gateway shares. */
export interface GatewayDeps {
  roster: Roster;
  registry: Registry;
  tickets: Tickets;
  /** The ways in to the programs that are registered, kept to match the registry. */
  ways: Ways;
  /** The operating system user who runs the gateway, which is who a connection that signed in as nobody is. */
  osUser: string;
  /** Told of what goes wrong that belongs to no call. */
  onError(error: Error): void;
}

/** Who is on the other end: a program on this machine, or a page that came through the browser entry. */
export type Peer = "program" | "browser";

/** What one connection to the gateway is: its `Gateway`, and how to let go of what it leaves behind. */
export interface ServedGateway {
  readonly gateway: Gateway;
  /** The connection is over: its registration goes with it. */
  end(): void;
}

/**
 * The `Gateway` one connection talks to. The connection holds who it signed in
 * as and what it registered, and nothing else in the gateway remembers a
 * connection: a registration lasts as long as the connection that made it.
 */
export function serveGateway(deps: GatewayDeps, peer: Peer): ServedGateway {
  const { roster, registry, tickets, ways } = deps;
  const registrant = peer === "program" ? registry.connect() : undefined;
  let signedIn: string | undefined;
  let registered: ProgramName | undefined;

  const onThisMachine = (what: string): void => {
    if (peer === "program") return;
    refuse(
      `Only a program on the gateway's machine can ${what}. A browser can list what is running and who is on the roster.`,
      "service_not_allowed",
    );
  };

  /** Who this connection is: the member it signed in as, or the person who runs the gateway. */
  const caller = (): Member =>
    (signedIn === undefined ? roster.person(deps.osUser) : roster.member(signedIn)) ??
    refuse("The gateway has no member for this connection.");

  /** Who a connection is cannot change under a registration that was made as someone. */
  const beforeRegistering = (what: string): void => {
    if (registered !== undefined) refuse(`This connection has registered already, so it can't ${what}.`);
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
      onThisMachine("register");
      if (registrant === undefined) return;
      try {
        const { kind } = checkAnnouncement(announcement);
        let memberId: string | null = null;
        if (kind === "agent") {
          const member = signedIn === undefined ? undefined : roster.member(signedIn);
          if (member === undefined) refuse("An agent registers as a member: join or sign in first.");
          memberId = member.id;
        } else if (signedIn !== undefined) {
          refuse("Only an agent is a member. A program that is not one registers without signing in.");
        }
        const entry = registrant.register(announcement, memberId);
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
    list: async () => registry.list(),
    version: async () => SHRIMPY_VERSION,

    async join(name, token) {
      onThisMachine("join");
      beforeRegistering("join");
      if (signedIn !== undefined) refuse(`This connection is already signed in as ${caller().name}.`);
      const member = roster.join(name, token);
      signedIn = member.id;
      return member;
    },
    async signIn(token, name) {
      onThisMachine("sign in");
      beforeRegistering("sign in");
      const member = typeof token === "string" ? roster.memberWithToken(token) : undefined;
      if (member === undefined) {
        refuse("The gateway does not know that token. It may belong to a roster that was replaced.");
      }
      if (signedIn !== undefined && signedIn !== member.id) {
        refuse(`This connection is already signed in as ${caller().name}.`);
      }
      const wanted: unknown = name;
      const signed = wanted === null || wanted === undefined ? member : roster.rename(member.id, wanted as string);
      signedIn = signed.id;
      // A rename moves the registrations of that member to the new name, and their ways in with them.
      if (signed.name !== member.name) await openWays();
      return signed;
    },
    async members() {
      const running = new Set(registry.list().map((program) => program.memberId));
      return roster.members().map((member) => ({ ...member, reachable: running.has(member.id) }));
    },

    async ticket(target) {
      onThisMachine("ask for a ticket");
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
      // Its way in goes with it, unless another program has the same name.
      ways.sync().catch((error: unknown) => {
        deps.onError(error instanceof Error ? error : new Error(String(error)));
      });
    },
  };
}
