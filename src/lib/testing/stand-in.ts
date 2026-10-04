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
import { offerToConnection, offerToRoute } from "../offer/index.ts";
import { namedSocketPath } from "../runtime/node.ts";
import { stopAfter } from "./cleanup.ts";

/** One service and what answers it. */
export interface Offer {
  readonly service: Service<any>;
  readonly implementation: unknown;
  /** Runs when the connection it was offered to is let go of. */
  readonly released?: () => void;
}

/**
 * Offer `implementation` as `service`, and run `released` when the connection
 * it is offered to is let go of. Whether it fits the service is the test's
 * business.
 */
export function offer<T>(service: Service<T>, implementation: NoInfer<T>, released?: () => void): Offer {
  return { service, implementation, released };
}

export interface StandInOptions {
  /** The server ID it claims, a random one by default. A client that expects a fixed ID needs it. */
  serverId?: string;
  /** The service each connection is offered. `presentation` routes the connection to a route. */
  offer(presentation: RoutedServerPresentation): Offer;
  /** The service of route `routeId`, or undefined when there is no such route. */
  route?(routeId: string): Offer | undefined;
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
  const serverId = options.serverId ?? randomUUID();
  const socket = namedSocketPath(name);
  let connections = 0;

  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      const { service, implementation, released } = options.offer(presentation);
      return offerToConnection(service, implementation, released);
    },
  };
  const host: ServerHost = {
    serverServices,
    resolveSession(routeId) {
      if (options.route?.(routeId) === undefined) {
        return Promise.reject(new SessionNotFoundError(`Unknown route: ${routeId}`));
      }
      return Promise.resolve({ id: routeId });
    },
    openSession(metadata) {
      const found = options.route?.(metadata.id);
      if (found === undefined) return Promise.reject(new Error(`Unknown route: ${metadata.id}`));
      return Promise.resolve(offerToRoute(found.service, found.implementation));
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
