import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { openConnection } from "../../lib/connection/index.ts";
import { GATEWAY_SERVER_ID } from "./endpoint.ts";
import { Gateway, type Registration } from "./services.ts";

export interface GatewayConnection {
  /**
   * Announce a program. It stays registered while this connection is open, and
   * registering again replaces the earlier entry.
   */
  register(registration: Registration): Promise<void>;
  list(): Promise<Registration[]>;
  /**
   * Called once when the connection ends, whether the gateway went away or
   * `close` was called. Nothing reconnects by itself: a program that wants to
   * stay registered uses `keepRegistered`, from the Node door.
   */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function connectGateway(options: {
  transportFactory: ByteTransportFactory;
}): Promise<GatewayConnection> {
  const connection = await openConnection({
    serverId: GATEWAY_SERVER_ID,
    transportFactory: options.transportFactory,
    service: Gateway,
  });
  const gateway = connection.service;
  return {
    register: (registration) => gateway.register(registration, context),
    list: () => gateway.list(context),
    onDisconnect: (listener) => connection.onDisconnect(listener),
    close: () => connection.close(),
  };
}
