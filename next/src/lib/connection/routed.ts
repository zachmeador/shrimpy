import {
  type Context,
  createRemoteServiceBinding,
  type RemoteServiceBinding,
  type Service,
} from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createClientServiceTransport } from "@earendil-works/pi-client";
import { type Connection, type ConnectionOptions, connect } from "./connection.ts";
import { expectRoute } from "./route.ts";

const context = BACKGROUND_CONTEXT;

/** What the service of a program that routes connections to sessions must offer. */
export interface Routing {
  attach(sessionId: string, context: Context): Promise<void>;
  detach(context: Context): Promise<void>;
}

/** A session the connection is attached to. */
export interface Attachment<T> {
  /** The session's service, bound for as long as the attachment lasts. */
  readonly service: T;
  /** False once the connection has detached, attached another session or closed. */
  isCurrent(): boolean;
}

export interface RoutedConnection<S, T> extends Connection<S> {
  /**
   * Watch one session: ask the server to route this connection to it, wait for
   * the route, and bind the session's service over it. A connection is attached
   * to one session at a time, so attaching again lets go of the first.
   */
  attach(sessionId: string): Promise<Attachment<T>>;
  /** Let go of the attached session. Does nothing if there is none. */
  detach(): Promise<void>;
}

/** Connect to a program that routes connections to sessions, whose service is `session`. */
export async function openRoutedConnection<S extends Routing, T>(
  options: ConnectionOptions<S> & { session: Service<T> },
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
      if (closing?.goodbye !== false) await detach();
      attached = undefined;
      await connection.close(closing);
    },
    async attach(sessionId) {
      await detach();
      const route = expectRoute(client);
      try {
        await connection.service.attach(sessionId, context);
        await route.arrived;
        const scope = createRemoteServiceBinding({
          services: [options.session],
          transport: createClientServiceTransport(client, () => client.attachment),
          bound: true,
        });
        const held = { scope };
        attached = held;
        const bound = scope.use(options.session);
        await scope.ready(context);
        return { service: bound, isCurrent: () => attached === held };
      } catch (error) {
        route.cancel();
        await detach();
        throw error;
      }
    },
  };
}
