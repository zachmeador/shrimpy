import type { TestContext } from "node:test";
import { type Context, defineService } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { openConnection } from "../../lib/connection/index.ts";
import { offer, type StandIn, startStandIn } from "../../lib/testing/index.ts";

interface Echo {
  echo(text: string, context: Context): Promise<string>;
}
const Echo = defineService<Echo>("shrimpy.gateway.testing.echo");

export type EchoProgram = StandIn;

/**
 * A program with one service that answers with what it was asked. It stands in
 * for an agent behind the gateway's pipe, and it listens in the test's runtime
 * directory under `name`.
 */
export function startEchoProgram(t: TestContext, name: string): Promise<EchoProgram> {
  return startStandIn(t, name, { offer: () => offer(Echo, { echo: (text) => Promise.resolve(`echo: ${text}`) }) });
}

export interface EchoClient {
  echo(text: string): Promise<string>;
  /** Called when the connection ends, from either side. */
  onDisconnect(listener: () => void): void;
  close(): Promise<void>;
}

/** Call an echo program over any transport: its Unix socket, or the gateway's WebSocket. */
export async function connectEcho(
  serverId: string,
  transportFactory: ByteTransportFactory,
): Promise<EchoClient> {
  const connection = await openConnection({ serverId, transportFactory, service: Echo });
  return {
    echo: (text) => connection.service.echo(text, BACKGROUND_CONTEXT),
    onDisconnect: (listener) => connection.onDisconnect(() => listener()),
    close: () => connection.close(),
  };
}
