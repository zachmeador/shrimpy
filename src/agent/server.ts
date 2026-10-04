import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import {
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import {
  type AgentEndpoint,
  endpointFile,
  type Member,
  SessionDirectory,
  SessionService,
} from "../contracts/agent/index.ts";
import { isClientGone, offerToConnection, offerToRoute } from "../lib/offer/index.ts";
import { socketPathFor } from "../lib/runtime/node.ts";
import { carryCallers, guardSession } from "./access/index.ts";
import { type Entry, type HomeFiles, serveDirectory } from "./directory.ts";
import type { Host } from "./host/index.ts";
import type { Sessions } from "./sessions/index.ts";

export type { HomeFiles } from "./directory.ts";

export interface AgentServer {
  /** Where the agent is reached by its home's path: the socket the home's owner connects to, which asks for no ticket. */
  readonly endpoint: AgentEndpoint;
  /** The socket the gateway pipes connections to, which asks for a ticket first. Only the gateway is told. */
  readonly gatewaySocket: string;
  /** Refuse new input from now on. Clients can still watch and stop work. */
  stopIntake(): void;
  close(): Promise<void>;
}

export interface ServerOptions {
  /** Whose a ticket is, for a connection that came through the gateway. */
  whose(ticket: string): Promise<Member>;
}

/**
 * Serve the agent API for `host`'s sessions on two Unix sockets: the home's,
 * which the home's owner reaches by the home's path and which asks for no
 * ticket, as it never has; and the one the gateway pipes the connections made
 * by the agent's name to, whose connections come in with a ticket before
 * anything else. Both are the same server to a client, and the home's path is
 * recorded for them to find.
 */
export async function startServer(
  host: Host,
  sessions: Sessions,
  files: HomeFiles,
  options: ServerOptions,
): Promise<AgentServer> {
  const endpoint: AgentEndpoint = {
    serverId: previousServerId(host.home) ?? randomUUID(),
    socket: socketPathFor(host.home),
    pid: process.pid,
  };
  const gatewaySocket = socketPathFor(host.home, "gw");
  let takingInput = true;
  const serve = (socket: string, entry: Entry): Server =>
    new Server(serverHost(sessions, files, () => takingInput, entry), {
      serverId: endpoint.serverId,
      listeners: [createUnixListener({ path: socket })],
      onError(error) {
        if (!isClientGone(error)) console.error("[agent]", error.message);
      },
    });
  const servers = [
    serve(endpoint.socket, { via: "home" }),
    serve(gatewaySocket, { via: "gateway", whose: (ticket) => options.whose(ticket) }),
  ];
  const closeAll = async (): Promise<void> => {
    await Promise.all(servers.map((server) => server.close()));
    rmSync(endpoint.socket, { force: true });
    rmSync(gatewaySocket, { force: true });
  };

  // This process holds the home's lock, so a socket left at either path is stale.
  rmSync(endpoint.socket, { force: true });
  rmSync(gatewaySocket, { force: true });
  try {
    for (const server of servers) await server.start();
    // Written whole or not at all, so nobody reads half of it.
    const unfinished = `${endpointFile(host.home)}.${String(process.pid)}`;
    writeFileSync(unfinished, JSON.stringify(endpoint));
    renameSync(unfinished, endpointFile(host.home));
  } catch (error) {
    await closeAll();
    throw error;
  }
  return {
    endpoint,
    gatewaySocket,
    stopIntake() {
      takingInput = false;
    },
    close: closeAll,
  };
}

function serverHost(sessions: Sessions, files: HomeFiles, takingInput: () => boolean, entry: Entry): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      return offerToConnection(SessionDirectory, serveDirectory({ sessions, files, entry, presentation }));
    },
  };
  return {
    serverServices,
    async resolveSession(threadId) {
      if (!(await sessions.has(threadId))) throw new SessionNotFoundError(`Unknown session: ${threadId}`);
      return { id: threadId };
    },
    async openSession(metadata) {
      const served = await sessions.serve(metadata.id, takingInput);
      return carryCallers(offerToRoute(SessionService, guardSession(served.service), { closed: () => served.close() }));
    },
  };
}

function previousServerId(home: string): string | undefined {
  const file = endpointFile(home);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as AgentEndpoint).serverId;
}
