import type { Host } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import {
  type Hello,
  type Member,
  otherPi,
  type Principal,
  type Reason,
  readHello,
  readVersions,
  type Revocation,
  samePi,
  turnAway,
  welcome,
  type Who,
} from "../../contracts/gateway/index.ts";
import type { Greeted } from "../../lib/link/node.ts";
import type { Invitations } from "../invitations/index.ts";
import type { Programs } from "../programs/index.ts";
import type { Roster } from "../roster/index.ts";

/** The door a connection came in by: the gateway's own socket, or its entry on an address. */
export type Door = "socket" | "entry";

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

/**
 * Who a connection is, from its hello and the door it came in by, and what the
 * gateway answers. A client's link is accepted, stamped with who it is; a
 * program's is taken as the route to it; a join gets its answer and its
 * connection closes. Everything is decided at once, so two hellos are never
 * decided at the same time.
 */
export function greeter(deps: HelloDeps): (door: Door) => (raw: unknown) => Greeted {
  const { roster, programs, invitations, host, context } = deps;

  const away = (words: string, reason: Reason | null = null): Greeted => ({ answer: turnAway(words, reason) });

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
    return { answer: welcome(you), take: (linked) => host.accept(linked.link, { principal }, context) };
  };

  const agentProgram = (who: Extract<Who, { kind: "agent" }>, shrimpy: string, door: Door): Greeted => {
    const found = roster.recognize(who.token);
    if (found?.way.kind === "device") return away(NOT_A_PROGRAM);
    // A token the gateway doesn't know joins it beside the gateway, where its socket is the check, and nowhere else.
    if (found === undefined && door !== "socket") return unknownToken;
    if (found !== undefined && programs.agentLinked(found.member.id)) return running(found.member);
    const made = found === undefined ? roster.join(who.name, who.token) : roster.rename(found.member.id, who.name);
    if (made.kind === "refused") return away(made.words, made.reason);
    const member = made.value;
    const way = roster.recognize(who.token)?.way;
    if (way?.kind !== "token") return unknownToken;
    const principal = { kind: "agent", member: member.id, way } as const;
    return { answer: welcome(member), take: (linked) => programs.takeAgent(principal, member.name, shrimpy, linked) };
  };

  const chatProgram = (shrimpy: string, door: Door): Greeted => {
    if (door !== "socket") return away("The chat server links in on the gateway's own socket, on the gateway's machine.");
    if (programs.chatLinked()) return away("A chat server is linked already, and a gateway has one.");
    return { answer: welcome(null), take: (linked) => programs.takeChat(shrimpy, linked) };
  };

  const join = (who: Extract<Who, { kind: "join" }>, door: Door): Greeted => {
    if (door !== "entry") {
      return away("Joining is for the gateway's entry. On its own socket an agent links in with its new token, and you are you already.");
    }
    const known = roster.recognize(who.token);
    if (who.name === null) {
      // A device that never heard its answer shows the same token again, and is let in: its code was used for it.
      if (known?.way.kind === "device") return { answer: welcome(known.member) };
      if (known !== undefined) return away("That token is an agent's, and a token belongs to one member.");
      const invited = invitations.checkForDevice(who.code);
      if (!invited.ok) {
        return away(
          invited.why === "used"
            ? CODE_USED
            : "The gateway has no invitation like that for a device of yours. An invitation is good once, for fifteen minutes and for what it was made for. Check the code, or ask for a new one.",
        );
      }
      const added = roster.addDevice(invited.person, who.token, who.machine);
      if (added.kind === "refused") return away(added.words, added.reason);
      invited.spend();
      return { answer: welcome(added.value) };
    }
    if (known?.way.kind === "device") return away(NOT_A_PROGRAM);
    // An agent that never heard its answer joins again with the same token and is the same member.
    if (known !== undefined) {
      if (programs.agentLinked(known.member.id)) return running(known.member);
      const renamed = roster.rename(known.member.id, who.name);
      return renamed.kind === "refused" ? away(renamed.words, renamed.reason) : { answer: welcome(renamed.value) };
    }
    const invited = invitations.check(who.code, who.name);
    if (!invited.ok) {
      return away(
        invited.why === "used"
          ? CODE_USED
          : `The gateway has no invitation like that for ${who.name}. An invitation is good once, for fifteen minutes and for one name. Check the code, or ask for a new one.`,
      );
    }
    const joined = roster.join(who.name, who.token);
    if (joined.kind === "refused") return away(joined.words, joined.reason);
    invited.spend();
    return { answer: welcome(joined.value) };
  };

  return (door) => (raw) => {
    // The Pi packages come first, so a program of another release is told what to run where, whatever else its hello says.
    const versions = readVersions(raw);
    if (versions !== undefined && !samePi(versions.pi)) return away(otherPi(versions, ANSWERING));
    const hello: Hello | undefined = readHello(raw);
    if (hello === undefined) return away("That isn't a hello this gateway knows, so the other end may be another version of Shrimpy, or not Shrimpy at all.");
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
  };
}
