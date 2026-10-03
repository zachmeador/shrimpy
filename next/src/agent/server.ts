import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRemoteServiceEndpoint, RemoteServiceProvider } from "@earendil-works/chord";
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
import { socketPathFor } from "../lib/runtime/index.ts";
import type { Host } from "./host/index.ts";
import { findSession, listSessions, serveSession } from "./sessions/index.ts";

export interface AgentServer {
  readonly endpoint: AgentEndpoint;
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
  // This process holds the home's lock, so a socket left at its path is stale.
  rmSync(endpoint.socket, { force: true });
  const server = new Server(serverHost(host), {
    serverId: endpoint.serverId,
    listeners: [createUnixListener({ path: endpoint.socket })],
    onError: (error) => console.error("[agent]", error.message),
  });
  await server.start();
  writeFileSync(endpointFile(host.home), JSON.stringify(endpoint));
  return {
    endpoint,
    async close() {
      await server.close();
      rmSync(endpoint.socket, { force: true });
    },
  };
}

function serverHost(host: Host): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      const provider = new RemoteServiceProvider([{ service: SessionDirectory, mode: "singleton" }]);
      provider.provide(SessionDirectory, {
        list: () => Promise.resolve(listSessions()),
        attach: (sessionId, callContext) => presentation.attachSession(sessionId, callContext),
        detach: (callContext) => presentation.detachSession(callContext),
      });
      const remote = createRemoteServiceEndpoint(provider);
      return {
        invokeService: (call, publish, callContext) => remote.invoke(call, publish, callContext),
        release() {
          remote.dispose();
          provider.dispose();
        },
      };
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
      const served = await serveSession(conversation, context);
      const provider = new RemoteServiceProvider([{ service: SessionService, mode: "singleton" }]);
      provider.provide(SessionService, served.service);
      return {
        attachClient() {
          const remote = createRemoteServiceEndpoint(provider);
          return {
            invokeService: (call, publish, callContext) => remote.invoke(call, publish, callContext),
            release: () => remote.dispose(),
          };
        },
        close() {
          served.close();
          provider.dispose();
          return Promise.resolve();
        },
      };
    },
  };
}

function previousServerId(home: string): string | undefined {
  const file = endpointFile(home);
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as AgentEndpoint).serverId;
}
