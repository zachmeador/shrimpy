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
  SessionDirectory,
  SessionService,
} from "../contracts/agent/index.ts";
import { offerToConnection, offerToRoute } from "../lib/offer/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { socketPathFor } from "../lib/runtime/node.ts";
import type { Host } from "./host/index.ts";
import type { Sessions } from "./sessions/index.ts";

export interface AgentServer {
  readonly endpoint: AgentEndpoint;
  /** Refuse new input from now on. Clients can still watch and stop work. */
  stopIntake(): void;
  close(): Promise<void>;
}

/** Serve the agent API for `host`'s sessions on a Unix socket, and record where to find it. */
export async function startServer(host: Host, sessions: Sessions): Promise<AgentServer> {
  const endpoint: AgentEndpoint = {
    serverId: previousServerId(host.home) ?? randomUUID(),
    socket: socketPathFor(host.home),
    pid: process.pid,
  };
  let takingInput = true;
  // This process holds the home's lock, so a socket left at its path is stale.
  rmSync(endpoint.socket, { force: true });
  const server = new Server(serverHost(sessions, () => takingInput), {
    serverId: endpoint.serverId,
    listeners: [createUnixListener({ path: endpoint.socket })],
    onError: (error) => console.error("[agent]", error.message),
  });
  await server.start();
  // Written whole or not at all, so nobody reads half of it.
  const unfinished = `${endpointFile(host.home)}.${String(process.pid)}`;
  writeFileSync(unfinished, JSON.stringify(endpoint));
  renameSync(unfinished, endpointFile(host.home));
  return {
    endpoint,
    stopIntake() {
      takingInput = false;
    },
    async close() {
      await server.close();
      rmSync(endpoint.socket, { force: true });
    },
  };
}

function serverHost(sessions: Sessions, takingInput: () => boolean): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      return offerToConnection(SessionDirectory, {
        list: () => sessions.list(),
        async attach(threadId, callContext) {
          // Refused here, not by the router, so the reason reaches the client.
          if (!(await sessions.has(threadId))) refuse(`This agent has no session for thread ${threadId} yet.`);
          await presentation.attachSession(threadId, callContext);
        },
        detach: (callContext) => presentation.detachSession(callContext),
      });
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
      return offerToRoute(SessionService, served.service, { closed: () => served.close() });
    },
  };
}

function previousServerId(home: string): string | undefined {
  const file = endpointFile(home);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as AgentEndpoint).serverId;
}
