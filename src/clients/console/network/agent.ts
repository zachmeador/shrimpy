import {
  type AgentConnection,
  connectAgent,
  type SessionSummary,
  type SessionView,
} from "../../../contracts/agent/index.ts";
import { reachProgram, type Transports } from "../../../contracts/gateway/index.ts";
import { isDisconnected } from "../../../lib/connection/index.ts";
import { isRefusal } from "../../../lib/refusal/index.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import { converge } from "./converge.ts";
import { keepConnection } from "./keep.ts";
import type { RegistryLink } from "./registry.ts";
import { Down, type LinkStatus, type Problem, problemOf } from "./status.ts";

/** What the watched session, at the address given, looks like now, or why it could not be watched. */
export type SessionUpdate = { session: string; view: SessionView } | { session: string; problem: Problem };

export interface AgentLinkOptions {
  /** The agent's name as the gateway lists it. */
  name: string;
  registry: RegistryLink;
  transports: Transports;
  /** Told of each view of the watched session, from the first, and of a session that could not be watched. */
  onSession(update: SessionUpdate): void;
  /** How often to look for the watched session while the agent has none yet. */
  pollMs: number;
  /** The pauses between attempts to reach the agent. Tests shorten them. */
  backoff?: Backoff;
}

/** The console's way to one agent, whether or not it is reachable right now. */
export interface AgentLink {
  readonly name: string;
  status(): LinkStatus;
  /** Tell `listener` each time the status changes. Returns what stops that. */
  onStatus(listener: (status: LinkStatus) => void): () => void;
  /**
   * Ask the agent which sessions it has, in the order it lists them. Fails with
   * `Down` when the agent is not reachable, and with the agent's own words when
   * it refuses.
   */
  sessions(): Promise<SessionSummary[]>;
  /**
   * Watch a session by its address, which is a thread's ID or `trigger:` and a
   * trigger's name: its view is passed on from now on, and again after each
   * time the connection comes back. An agent with no such session yet has
   * nothing to watch, and is looked at again until it has one. Watching another
   * session, or none, lets go of this one.
   */
  watch(session: string | undefined): void;
  /** Hang up and stop trying to reach the agent. */
  close(): Promise<void>;
}

/**
 * Keep a connection to the agent called `name`: reach it by its name through
 * the gateway, with a ticket to come in with, hold the connection, answer for
 * its list of sessions, and keep watching the session that is wanted across
 * losses. The work in the agent goes on whether or not this link is up.
 */
export function keepAgent(options: AgentLinkOptions): AgentLink {
  let wanted: string | undefined;
  let watching: { id: string; connection: AgentConnection; stop: () => void } | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let reported: string | undefined;
  let closed = false;

  const later = (): void => {
    clearTimeout(retry);
    if (!closed) retry = setTimeout(() => void settle(), options.pollMs);
  };

  const settle = converge(
    async () => {
      clearTimeout(retry);
      const connection = keeper.current();
      if (connection === undefined) return;
      const attached = watching;
      if (attached !== undefined && attached.id === wanted && attached.connection === connection) return;
      attached?.stop();
      watching = undefined;
      if (wanted === undefined) return;
      const id = wanted;
      try {
        if (!(await connection.sessions()).some((session) => session.id === id)) return later();
        const handle = await connection.attach(id);
        if (wanted !== id || keeper.current() !== connection) return;
        const stop = handle.subscribe((view) => options.onSession({ session: id, view }));
        watching = { id, connection, stop };
        reported = undefined;
      } catch (error) {
        // Whichever it is, look again later. A lost connection is the link's to report, and any other trouble is reported once.
        const problem = problemOf(error);
        if ("said" in problem && reported !== problem.said) options.onSession({ session: id, problem });
        reported = "said" in problem ? problem.said : reported;
        later();
      }
    },
    (error) => options.onSession({ session: wanted ?? "", problem: problemOf(error) }),
  );

  const keeper = keepConnection<AgentConnection>({
    backoff: options.backoff,
    async open(signal, waiting) {
      const registration = await options.registry.untilListed(
        (program) => program.kind === "agent" && program.name === options.name,
        signal,
        () => waiting({ kind: "not-registered" }),
      );
      waiting({ kind: "connecting" });
      try {
        const { connection } = await reachProgram({
          gateway: options.registry,
          transports: options.transports,
          target: { kind: registration.kind, name: registration.name },
          connect: connectAgent,
          enter: (opened, ticket) => opened.enter(ticket),
          signal,
        });
        return connection;
      } catch (error) {
        if (signal.aborted || error instanceof Down || isRefusal(error)) throw error;
        // A connection that ends at once, or a way in that is gone, is the agent having gone away.
        if (isDisconnected(error)) throw new Down({ kind: "lost" }, { cause: error });
        throw new Down(
          { kind: "unreachable", message: `Could not reach the agent ${options.name} through the gateway: ${(error as Error).message}` },
          { cause: error },
        );
      }
    },
    onUp() {
      reported = undefined;
      void settle();
      return () => {
        clearTimeout(retry);
        watching?.stop();
        watching = undefined;
      };
    },
  });

  return {
    name: options.name,
    status: () => keeper.status(),
    onStatus: (listener) => keeper.onStatus(listener),
    async sessions() {
      const connection = keeper.current();
      if (connection === undefined) {
        const status = keeper.status();
        throw new Down(status.state === "down" ? status.why : { kind: "lost" });
      }
      return connection.sessions();
    },
    watch(session) {
      wanted = session;
      reported = undefined;
      void settle();
    },
    async close() {
      closed = true;
      clearTimeout(retry);
      await keeper.close();
    },
  };
}
