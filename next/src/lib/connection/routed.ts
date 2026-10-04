import {
  type Context,
  createRemoteServiceBinding,
  type RemoteServiceBinding,
  type Service,
} from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createClientServiceTransport } from "@earendil-works/pi-client";
import { type Connection, type ConnectionOptions, connect } from "./connection.ts";
import { politely } from "./goodbye.ts";
import { expectRoute } from "./route.ts";

const context = BACKGROUND_CONTEXT;

/** What the service of a program that routes connections must offer. */
export interface Routing {
  attach(routeId: string, context: Context): Promise<void>;
  detach(context: Context): Promise<void>;
}

/** A route the connection is attached to. */
export interface Attachment<T> {
  /** The route's service, bound for as long as the attachment lasts. */
  readonly service: T;
  /** False once the connection has detached, attached another route or closed. */
  isCurrent(): boolean;
}

export interface RoutedConnection<S, T> extends Connection<S> {
  /**
   * Attach to the route `routeId`: ask the server to send this connection
   * there, wait for the server to announce it, and bind the route's service
   * over it. A connection is attached to one route at a time, so attaching
   * again lets go of the first.
   */
  attach(routeId: string): Promise<Attachment<T>>;
  /** Let go of the attached route. Does nothing if there is none. */
  detach(): Promise<void>;
}

/** Connect to a program that routes connections, whose routes all offer the service `route`. */
export async function openRoutedConnection<S extends Routing, T>(
  options: ConnectionOptions<S> & { route: Service<T> },
): Promise<RoutedConnection<S, T>> {
  const { client, connection } = await connect(options);
  let attached: { scope: RemoteServiceBinding } | undefined;

  const detach = async (): Promise<void> => {
    const held = attached;
    attached = undefined;
    if (held === undefined) return;
    await held.scope.dispose(context).catch(() => undefined);
    await connection.service.detach(context).catch(() => undefined);
  };

  return {
    ...connection,
    detach,
    async close(closing) {
      // A goodbye that ran out of time has no use for a second one.
      const goodbye = closing?.goodbye !== false && (await politely(detach()));
      attached = undefined;
      await connection.close({ ...closing, goodbye });
    },
    async attach(routeId) {
      await detach();
      const arrival = expectRoute(client);
      try {
        await connection.service.attach(routeId, context);
        await arrival.arrived;
        const scope = createRemoteServiceBinding({
          services: [options.route],
          transport: createClientServiceTransport(client, () => client.attachment),
          bound: true,
        });
        const held = { scope };
        attached = held;
        const bound = scope.use(options.route);
        await scope.ready(context);
        return { service: bound, isCurrent: () => attached === held };
      } catch (error) {
        arrival.cancel();
        await detach();
        throw error;
      }
    },
  };
}
