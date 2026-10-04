import type { TestContext } from "node:test";
import { offer, type StandIn, startStandIn } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME, type Registration } from "../index.ts";
import { gatewayThatDoes } from "./partial.ts";

export interface StandInGateway extends StandIn {
  /** Every registration it was sent, oldest first, including those whose connection has ended. */
  readonly received: Registration[];
  /** The registrations that are live now: the latest from each connection still open, oldest first. */
  registered(): Registration[];
}

export interface StandInGatewayOptions {
  /** The version it reports for itself. The version of Shrimpy by default. */
  version?: string;
  /**
   * The name of the socket it listens on in the runtime directory. By default
   * that is the machine's gateway socket; another name makes a gateway
   * somewhere else.
   */
  socketName?: string;
}

/**
 * A stand-in for the gateway: it takes registrations, and keeps each for as
 * long as the connection that made it lasts. It listens where the gateway
 * does, so the test needs a runtime directory of its own, and it is closed
 * when the test ends.
 */
export async function startStandInGateway(
  t: TestContext,
  options: StandInGatewayOptions = {},
): Promise<StandInGateway> {
  const live = new Map<object, Registration>();
  const received: Registration[] = [];
  const standIn = await startStandIn(t, options.socketName ?? GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer() {
      // Stands for this connection in the registrations it makes.
      const connection = {};
      return offer(
        Gateway,
        gatewayThatDoes({
          register(registration) {
            received.push(registration);
            live.delete(connection);
            live.set(connection, registration);
            return Promise.resolve();
          },
          list: () => Promise.resolve([...live.values()]),
          members: () => Promise.resolve([]),
          version: () => Promise.resolve(options.version ?? SHRIMPY_VERSION),
        }),
        () => live.delete(connection),
      );
    },
  });
  return Object.assign(standIn, { received, registered: () => [...live.values()] });
}
