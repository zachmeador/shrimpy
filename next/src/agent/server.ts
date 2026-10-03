import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
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
import { offerToConnection, offerToSession } from "../lib/offer/index.ts";
import { socketPathFor } from "../lib/runtime/index.ts";
import type { Host } from "./host/index.ts";
import { findSession, listSessions, serveSession } from "./sessions/index.ts";

export interface AgentServer {
  readonly endpoint: AgentEndpoint;
  /** Refuse new input from now on. Clients can still watch and stop work. */
  stopIntake(): void;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

/** Serve the agent API for `host` on a Unix socket, and record where to find it. */
export async function startServer(host: Host): Promise<AgentServer> {
  const endpoint: AgentEndpoint = {
    serverId: previousServerId(host.home) ?? randomUUID(),
    socket: socketPathFor(host.home),
    pid: process.pid,
  };
  let takingInput = true;
  // This process holds the home's lock, so a socket left at its path is stale.
  rmSync(endpoint.socket, { force: true });
  const server = new Server(serverHost(host, () => takingInput), {
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

function serverHost(host: Host, takingInput: () => boolean): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      return offerToConnection(SessionDirectory, {
        list: () => Promise.resolve(listSessions()),
        attach: (sessionId, callContext) => presentation.attachSession(sessionId, callContext),
        detach: (callContext) => presentation.detachSession(callContext),
      });
    },
  };
  return {
    serverServices,
    async resolveSession(sessionId, callContext) {
      const conversation = await findSession(host.harness, sessionId, callContext);
      if (conversation === undefined) throw new SessionNotFoundError(`Unknown session: ${sessionId}`);
      return { id: sessionId };
    },
    async openSession(metadata) {
      const conversation = await findSession(host.harness, metadata.id, context);
      if (conversation === undefined) throw new SessionNotFoundError(`Unknown session: ${metadata.id}`);
      const served = await serveSession(host.harness, conversation, context, takingInput);
      return offerToSession(SessionService, served.service, { closed: () => served.close() });
    },
  };
}

function previousServerId(home: string): string | undefined {
  const file = endpointFile(home);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as AgentEndpoint).serverId;
}
