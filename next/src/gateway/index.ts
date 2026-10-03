/**
 * The gateway program: one process per machine that keeps the registry of
 * running programs. It only connects things: it never holds an agent's home,
 * its work or a conversation. Other programs reach it through
 * `contracts/gateway`; they never import this program's modules.
 */
import { createRegistry } from "./registry/index.ts";
import { startServer } from "./server.ts";

export { GatewayRunningError } from "./lock.ts";

export interface RunningGateway {
  /** The Unix socket programs connect to. */
  readonly socket: string;
  close(): Promise<void>;
}

/** Start serving this machine's gateway socket. Fails if a gateway is already serving it. */
export async function startGateway(): Promise<RunningGateway> {
  const server = await startServer(createRegistry());
  return { socket: server.socket, close: () => server.close() };
}
