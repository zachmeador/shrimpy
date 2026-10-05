import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import type { Reloaded, SessionDirectory } from "../contracts/agent/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { type Asker, type Caller, check, withCaller } from "./access/index.ts";
import type { Sessions } from "./sessions/durable.ts";
import type { Triggers } from "./triggers/durable.ts";

/** What the agent API asks of the agent's instructions and triggers. */
export interface HomeFiles {
  /** Read the home's instructions, context files, skills and triggers again. */
  reload(): Promise<Reloaded>;
}

/** How a connection to the agent came in. */
export type Entry =
  /** By the home's path. Whoever can reach the socket is the home's owner, so there is nobody to ask. */
  | { via: "home" }
  /** Through the gateway, which says who a ticket is made for. */
  | { via: "gateway"; whose(ticket: string): Promise<Asker> };

export interface DirectoryParts {
  sessions: Sessions;
  triggers: Triggers;
  files: HomeFiles;
  entry: Entry;
  /** Whether new work may still be started: it may not once the agent is stopping. */
  takingInput: () => boolean;
  /** This connection's way to pick the session it watches. */
  presentation: RoutedServerPresentation;
}

/**
 * The `SessionDirectory` one connection talks to. The connection holds who it
 * is: the home's owner from the start if it came by the home's path, and
 * nobody until it has come in with a ticket if it came through the gateway,
 * which is the first thing it does. Every call after that asks `check` whether
 * its caller may: watching the sessions and the triggers is watching, and
 * firing a trigger starts work, which is control.
 */
export function serveDirectory(parts: DirectoryParts): SessionDirectory {
  const { sessions, triggers, files, entry, takingInput, presentation } = parts;
  let caller: Caller | undefined = entry.via === "home" ? { via: "home" } : undefined;
  let entering = false;
  const who = (): Caller =>
    caller ?? refuse("Come in with a ticket from the gateway, with enter, before anything else.", "service_not_allowed");

  return {
    async enter(ticket) {
      if (entry.via === "home") refuse("A connection made by the home's path needs no ticket.");
      if (caller !== undefined || entering) refuse("This connection has entered already.");
      entering = true;
      try {
        const asker = await entry.whose(ticket);
        caller = { via: "gateway", ...asker };
        return asker.member;
      } finally {
        entering = false;
      }
    },
    async list() {
      check(who(), "watch");
      return sessions.list();
    },
    async attach(address, context) {
      const asking = who();
      check(asking, "watch");
      // Refused here, not by the router, so the reason reaches the client.
      if (!(await sessions.has(address))) refuse(`This agent has no session for ${address} yet.`);
      await presentation.attachSession(address, withCaller(context, asking));
    },
    detach(context) {
      who();
      return presentation.detachSession(context);
    },
    async triggers() {
      check(who(), "watch");
      return triggers.list();
    },
    async trigger(name) {
      check(who(), "watch");
      return triggers.show(name);
    },
    async fire(name) {
      check(who(), "control");
      if (!takingInput()) refuse("The agent is stopping and is not taking new input.", "service_not_allowed");
      return triggers.fire(name);
    },
    async reload() {
      check(who(), "administer");
      return files.reload();
    },
  };
}
