import { readFileSync } from "node:fs";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { THREAD_ID } from "./contract.ts";
import { type Endpoint, endpointFile } from "./endpoint.ts";
import { connectThread, type RemoteThread, webSocketTransport } from "./remote.ts";

const read = (home: string): Endpoint => JSON.parse(readFileSync(endpointFile(home), "utf8")) as Endpoint;

/** Attach to the server that owns `home`, over its Unix socket. */
export async function attachUnix(home: string): Promise<RemoteThread> {
	const endpoint = read(home);
	process.chdir(endpoint.dir);
	return connectThread({ serverId: endpoint.serverId, sessionId: THREAD_ID, transportFactory: createUnixTransportFactory({ path: endpoint.socket }) });
}

/** Attach over the WebSocket bridge, the way the browser does, but from Node. */
export async function attachWebSocket(home: string): Promise<RemoteThread> {
	const endpoint = read(home);
	return connectThread({ serverId: endpoint.serverId, sessionId: THREAD_ID, transportFactory: webSocketTransport(`ws://127.0.0.1:${endpoint.port}/ws`) });
}
