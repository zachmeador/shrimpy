import type { Host } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import {
  type Answer,
  type Hello,
  type HelloAnswer,
  type Member,
  nameKey,
  notAHello,
  otherRelease,
  type Principal,
  type Reason,
  readHello,
  type Refused,
  readVersions,
  refused,
  type Revocation,
  turnAway,
  unservedHello,
  welcome,
  type Who,
} from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import type { Greeted } from "../../lib/link/node.ts";
import type { Invitations } from "../invitations/index.ts";
import type { Programs } from "../programs/index.ts";
import type { Roster } from "../roster/index.ts";

/** The door a connection came in by: the gateway's own socket, or its entry on an address. The page's door has a greeting of its own. */
export type Door = "socket" | "entry";

/** What the gateway answers, and decides, for each door. */
export interface Greeter {
  /** What the gateway answers a hello that came in by `door`. */
  readonly greet: (door: Door) => (raw: unknown) => Greeted;
  /**
   * What the gateway answers a hello at the page's door, which only the web
   * client says: `kept` is the token the browser keeps in its cookie for the
   * door, if it sent one, and is who the browser is.
   */
  readonly greetPage: (raw: unknown, kept: string | undefined) => Greeted;
  /**
   * Let a browser in as a device of yours with an invitation's `code`,
   * labelled `label`: the answer, as a hello's, and the token the gateway made
   * for the browser when it is let in.
   */
  readonly letBrowserIn: (code: string, label: string) => { answer: HelloAnswer; token?: string };
}

export interface HelloDeps {
  readonly roster: Roster;
  readonly programs: Programs;
  readonly invitations: Invitations;
  readonly host: Host<Principal, Revocation>;
  /** The parent of the work arriving on clients' links. */
  readonly context: Context;
}

const ANSWERING = { who: "The gateway", where: "on the gateway's machine" };

const CODE_USED = "That invitation was used already. An invitation is good once, so ask for a new one.";

const NOT_A_PROGRAM = "That token is a device's, and a device is you, not a program: only an agent links in as a program.";

const NO_DEVICE_INVITATION =
  "The gateway has no invitation like that for a device of yours. An invitation is good once, for fifteen minutes and for what it was made for. Check the code, or ask for a new one.";

const ONLY_THE_PAGE = "The page's door takes the web client's link and nothing else. A program links in at the gateway's socket or its entry.";

const BROWSER_NOT_IN =
  "This browser isn't let in. Ask for an invitation for a device of yours with shrimpy invite, and open the link it prints in this browser.";

const BROWSER_UNKNOWN =
  "The gateway doesn't know this browser any more: it may have been taken back, or the roster was replaced. Open the link of a new invitation in it to let it in again.";

/**
 * Who a connection is, from its hello and the door it came in by, and what the
 * gateway answers. A client's link is accepted, stamped with who it is; a
 * program's is taken as the route to it; a join gets its answer and its
 * connection closes. Everything is decided at once, so two hellos are never
 * decided at the same time. A browser is let in by the code its page shows the
 * page's door, and is known by its cookie from then on.
 */
export function greeter(deps: HelloDeps): Greeter {
  const { roster, programs, invitations, host, context } = deps;

  const away = (words: string, reason: Reason | null = null): Greeted => ({ answer: turnAway(words, reason) });

  /** A refusal from the roster, passed on as the answer with its reason. */
  const passOn = (refusal: Refused): Greeted => ({ answer: { ...turnAway(refusal.words), reason: refusal.reason } });

  const unknownToken = away(
    "The gateway doesn't know that token. It may have been taken back, or belong to a roster that was replaced.",
    "unknown_token",
  );

  const running = (member: Member): Greeted =>
    away(
      `The agent "${member.name}" is linked already, and this shows its token, so the gateway takes it for a second copy of the same agent.`,
      "agent_running",
    );

  const client = (token: string | null, door: Door): Greeted => {
    let you: Member;
    let principal: Principal;
    if (token === null) {
      if (door !== "socket") return away("Over the gateway's entry a client shows a token: a device's, or an agent's.");
      you = roster.you();
      principal = { kind: "person", member: you.id, way: { kind: "socket" } };
    } else {
      const found = roster.recognize(token);
      if (found === undefined) return unknownToken;
      you = found.member;
      principal = { kind: you.kind, member: you.id, way: found.way };
    }
    return { answer: welcome(you, roster.id), take: (linked) => host.accept(linked.link, { principal }, context) };
  };

  const agentProgram = (who: Extract<Who, { kind: "agent" }>, shrimpy: string, door: Door): Greeted => {
    const found = roster.recognize(who.token);
    if (found?.way.kind === "device") return away(NOT_A_PROGRAM);
    // A token this roster doesn't know is refused over the entry, and also on the gateway's socket when the home already
    // belonged to this roster (its token was taken back or replaced, or the agent was removed).
    if (found === undefined && (door !== "socket" || who.roster === roster.id)) return unknownToken;
    if (found !== undefined && programs.agentLinked(found.member.id)) return running(found.member);
    let member: Member;
    if (found !== undefined) {
      member = found.member;
    } else {
      // On the gateway's own socket, a home with a fresh token (such as after deleting state/member.json) reclaims an
      // existing agent of that name whose token was taken back, keeping its ID and DMs without needing an invitation.
      const ways = roster.ways();
      const tokenless = roster
        .members()
        .find((each) => each.kind === "agent" && nameKey(each.name) === nameKey(who.name) && !ways.some((way) => way.member === each.id));
      const made = tokenless === undefined ? roster.join(who.name, who.token) : roster.replaceToken(tokenless.id, who.token);
      if (made.kind === "refused") return passOn(made);
      member = "member" in made.value ? made.value.member : made.value;
    }
    const way = roster.recognize(who.token)?.way;
    if (way?.kind !== "token") return unknownToken;
    const principal = { kind: "agent", member: member.id, way } as const;
    return { answer: welcome(member, roster.id), take: (linked) => programs.takeAgent(principal, member.name, shrimpy, linked) };
  };

  const chatProgram = (shrimpy: string, door: Door): Greeted => {
    if (door !== "socket") return away("The chat server links in on the gateway's own socket, on the gateway's machine.");
    if (programs.chatLinked()) return away("A chat server is linked already, and a gateway has one.");
    return { answer: welcome(null, roster.id), take: (linked) => programs.takeChat(shrimpy, linked) };
  };

  /** Let a device of yours in with an invitation's `code`, as the holder of `token`, labelled `label`. */
  const letDeviceIn = (code: string, token: string, label: string): Answer<Member> => {
    const invited = invitations.checkForDevice(code);
    if (!invited.ok) return refused(invited.why === "used" ? CODE_USED : NO_DEVICE_INVITATION);
    const added = roster.addDevice(invited.person, token, label);
    if (added.kind === "done") invited.spend();
    return added;
  };

  const join = (who: Extract<Who, { kind: "join" }>, door: Door): Greeted => {
    if (door !== "entry") {
      return away("Joining is for the gateway's entry. On its own socket an agent links in with its new token, and you are you already.");
    }
    const known = roster.recognize(who.token);
    if (who.name === null) {
      // A device that never heard its answer shows the same token again, and is let in: its code was used for it.
      if (known?.way.kind === "device") return { answer: welcome(known.member, roster.id) };
      if (known !== undefined) return away("That token is an agent's, and a token belongs to one member.");
      const joined = letDeviceIn(who.code, who.token, who.machine);
      return joined.kind === "refused" ? passOn(joined) : { answer: welcome(joined.value, roster.id) };
    }
    if (known?.way.kind === "device") return away(NOT_A_PROGRAM);
    // An agent that never heard its answer joins again with the same token and is the same member.
    if (known !== undefined) {
      if (programs.agentLinked(known.member.id)) return running(known.member);
      return { answer: welcome(known.member, roster.id) };
    }
    const invited = invitations.check(who.code, who.name);
    if (!invited.ok) {
      return away(
        invited.why === "used"
          ? CODE_USED
          : `The gateway has no invitation like that for ${who.name}. An invitation is good once, for fifteen minutes and for one name. Check the code, or ask for a new one.`,
      );
    }
    if (invited.member !== null) {
      const replaced = roster.replaceToken(invited.member, who.token);
      if (replaced.kind === "refused") return passOn(replaced);
      invited.spend();
      const { member, replacedWay } = replaced.value;
      if (replacedWay !== undefined) {
        host.revoke({ way: replacedWay }, context);
        programs.dropAgent(member.id);
      }
      return { answer: welcome(member, roster.id) };
    }
    const joined = roster.join(invited.name, who.token);
    if (joined.kind === "refused") return passOn(joined);
    invited.spend();
    return { answer: welcome(joined.value, roster.id) };
  };

  /** The web client's link at the page's door, as the device whose token the browser's cookie keeps. */
  const page = (who: Who, kept: string | undefined): Greeted => {
    if (who.kind !== "client" || who.token !== null) return away(ONLY_THE_PAGE);
    if (kept === undefined) return away(BROWSER_NOT_IN);
    const found = roster.recognize(kept);
    if (found?.way.kind !== "device") return away(BROWSER_UNKNOWN, "unknown_token");
    const principal: Principal = { kind: "person", member: found.member.id, way: found.way };
    return { answer: welcome(found.member, roster.id), take: (linked) => host.accept(linked.link, { principal }, context) };
  };

  /**
   * The program a hello says it is, read leniently since another release may
   * say it differently, when the gateway can tell which: an agent by a token the
   * roster knows, or the chat server on the gateway's own socket.
   */
  const programIn = (raw: unknown, door: Door | "page"): { kind: "agent"; member: Member } | { kind: "chat" } | undefined => {
    const who = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).who : undefined;
    if (typeof who !== "object" || who === null) return undefined;
    const { kind, token } = who as Record<string, unknown>;
    if (kind === "chat") return door === "socket" ? { kind: "chat" } : undefined;
    if (kind !== "agent" || typeof token !== "string") return undefined;
    const found = roster.recognize(token);
    return found?.way.kind === "token" ? { kind: "agent", member: found.member } : undefined;
  };

  /**
   * The hello in `raw`, which came in by `door`, or what is answered to one of
   * a release that can't link with this one, which the roster then lists when
   * it can tell the program, or to one that can't be read: from a later release
   * of the major, that asks for something this one doesn't serve, or from
   * something that isn't Shrimpy.
   */
  const read = (raw: unknown, door: Door | "page"): Hello | Greeted => {
    // The versions come first, so a program of another release is told what to run where, whatever else its hello says.
    const versions = readVersions(raw);
    const other = versions === undefined ? undefined : otherRelease(versions, ANSWERING);
    if (versions === undefined) return away(notAHello("this gateway"));
    if (other === undefined) return readHello(raw) ?? away(unservedHello(versions, ANSWERING));
    const program = programIn(raw, door);
    if (program?.kind === "agent") programs.turnAway({ kind: "agent", name: program.member.name, member: program.member.id, ...versions });
    if (program?.kind === "chat") programs.turnAway({ kind: "chat", name: "chat", member: null, ...versions });
    return away(other);
  };

  return {
    greet: (door) => (raw) => {
      const hello = read(raw, door);
      if ("answer" in hello) return hello;
      const { who } = hello;
      switch (who.kind) {
        case "client":
          return client(who.token, door);
        case "agent":
          return agentProgram(who, hello.shrimpy, door);
        case "chat":
          return chatProgram(hello.shrimpy, door);
        case "join":
          return join(who, door);
      }
    },
    greetPage: (raw, kept) => {
      const hello = read(raw, "page");
      return "answer" in hello ? hello : page(hello.who, kept);
    },
    letBrowserIn: (code, label) => {
      const token = newToken();
      const joined = letDeviceIn(code, token, label);
      return joined.kind === "refused" ? { answer: { ...turnAway(joined.words), reason: joined.reason } } : { answer: welcome(joined.value, roster.id), token };
    },
  };
}
