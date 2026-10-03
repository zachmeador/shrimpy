import type { TestContext } from "node:test";
import { offer, type StandIn, startStandIn } from "../../../lib/testing/index.ts";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME, type Registration } from "../index.ts";

export interface StandInGateway extends StandIn {
  /** Every registration it was sent, oldest first, including those whose connection has ended. */
  readonly received: Registration[];
  /** The registrations that are live now: the latest from each connection still open, oldest first. */
  registered(): Registration[];
}

/**
 * A stand-in for the gateway: it takes registrations, and keeps each for as
 * long as the connection that made it lasts. It listens where the gateway
 * does, so the test needs a runtime directory of its own, and it is closed
 * when the test ends.
 */
export async function startStandInGateway(t: TestContext): Promise<StandInGateway> {
  const live = new Map<object, Registration>();
  const received: Registration[] = [];
  const standIn = await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer() {
      // Stands for this connection in the registrations it makes.
      const connection = {};
      return offer(
        Gateway,
        {
          register(registration) {
            received.push(registration);
            live.delete(connection);
            live.set(connection, registration);
            return Promise.resolve();
          },
          list: () => Promise.resolve([...live.values()]),
        },
        () => live.delete(connection),
      );
    },
  });
  return Object.assign(standIn, { received, registered: () => [...live.values()] });
}
