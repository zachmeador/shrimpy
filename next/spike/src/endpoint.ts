import { join } from "node:path";

export interface Endpoint {
	serverId: string;
	/** The Unix socket, relative to `dir`. macOS limits socket paths to 104 bytes, so the server and its clients chdir to `dir` first. */
	socket: string;
	dir: string;
	port: number;
}

/** Where a client finds the server that owns this home. The server id survives restarts so clients can reconnect to the same identity. */
export const endpointFile = (home: string): string => join(home, "runtime", "endpoint.json");
