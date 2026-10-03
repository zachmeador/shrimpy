import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Service } from "@earendil-works/chord";
import {
  type RoutedServerPresentation,
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { offerToConnection, offerToSession } from "../offer/index.ts";
import { namedSocketPath } from "../runtime/index.ts";
import { stopAfter } from "./cleanup.ts";

/** One service and what answers it. */
export interface Offer {
  readonly service: Service<any>;
  readonly implementation: unknown;
}

/** Offer `implementation` as `service`. Whether it fits the service is the test's business. */
export function offer<T>(service: Service<T>, implementation: NoInfer<T>): Offer {
  return { service, implementation };
}

export interface StandInOptions {
  /** The service each connection is offered. `presentation` routes the connection to a session. */
  offer(presentation: RoutedServerPresentation): Offer;
  /** The service of session `sessionId`, or undefined when there is no such session. */
  session?(sessionId: string): Offer | undefined;
}

export interface StandIn {
  readonly serverId: string;
  /** Absolute path of its Unix socket. */
  readonly socket: string;
  /** How many connections are open right now. */
  connections(): number;
  close(): Promise<void>;
}

/**
 * The smallest pi-server there is, for tests of what talks to one: it offers
 * the services the test gives it and nothing else. It listens in the runtime
 * directory under `name`, so the test has to have one, and it is closed when
 * the test ends.
 */
export async function startStandIn(
  t: TestContext,
  name: string,
  options: StandInOptions,
): Promise<StandIn> {
  const serverId = randomUUID();
  const socket = namedSocketPath(name);
  let connections = 0;

  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      const { service, implementation } = options.offer(presentation);
      return offerToConnection(service, implementation);
    },
  };
  const host: ServerHost = {
    serverServices,
    resolveSession(sessionId) {
      if (options.session?.(sessionId) === undefined) {
        return Promise.reject(new SessionNotFoundError(`Unknown session: ${sessionId}`));
      }
      return Promise.resolve({ id: sessionId });
    },
    openSession(metadata) {
      const found = options.session?.(metadata.id);
      if (found === undefined) return Promise.reject(new Error(`Unknown session: ${metadata.id}`));
      return Promise.resolve(offerToSession(found.service, found.implementation));
    },
  };

  const server = new Server(host, {
    serverId,
    listeners: [createUnixListener({ path: socket })],
    onConnectionCountChanged: (count) => {
      connections = count;
    },
  });
  await server.start();
  const standIn = { serverId, socket, connections: () => connections, close: () => server.close() };
  stopAfter(t, () => standIn.close());
  return standIn;
}
