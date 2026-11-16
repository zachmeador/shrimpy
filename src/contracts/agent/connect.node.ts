import { codeOf } from "../../lib/files/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { type Client, type ConnectOptions, connectClient } from "../gateway/node.ts";
import { type AgentEndpoint, endpointFile } from "./endpoint.ts";

/** Nothing is listening for the agent of a home. */
export class AgentNotRunningError extends Error {
  constructor(home: string, options?: ErrorOptions) {
    super(`No agent is running at ${home}.`, options);
    this.name = "AgentNotRunningError";
  }
}

/**
 * Where the agent that owns `home` last said it could be reached, or undefined
 * if none ever has. The file stays after the agent stops, so the endpoint may
 * be stale: only a link shows that an agent is there. A file that is there and
 * can't be used is an error naming it.
 */
export function readEndpoint(home: string): AgentEndpoint | undefined {
  const root = readConfig(endpointFile(home));
  if (root === undefined) return undefined;
  const endpoint = { socket: root.string("socket"), name: root.string("name"), pid: root.number("pid") };
  root.done();
  return endpoint;
}

/** A client's link to one agent by its home's path, through which it holds that agent's objects as `home`. */
export interface HomeClient extends Client {
  /** The name the agent answers to, which its objects' `agent` param takes. */
  readonly name: string;
}

export type ConnectHomeOptions = Pick<ConnectOptions, "signal" | "onError">;

/** Whether `error`, from dialing a socket's path, means nothing listens there. */
function nobodyThere(error: unknown): boolean {
  const code = codeOf(error instanceof Error ? error.cause : undefined);
  return code === "ECONNREFUSED" || code === "ENOENT";
}

/**
 * Link straight to the agent that owns `home`, by the home's path, with no
 * gateway and no token: the hello, then Chord with the agent as the client's
 * parent. Whatever the client holds of that agent it holds as `home`, whoever
 * may open the home's socket being whoever the agent runs as. Fails with
 * `AgentNotRunningError` when nothing listens there.
 */
export async function connectHome(home: string, options: ConnectHomeOptions = {}): Promise<HomeClient> {
  const endpoint = readEndpoint(home);
  if (endpoint === undefined) throw new AgentNotRunningError(home);
  try {
    const client = await connectClient({ ...options, place: { path: endpoint.socket }, token: null, home });
    return { ...client, name: endpoint.name };
  } catch (error) {
    if (nobodyThere(error)) throw new AgentNotRunningError(home, { cause: error });
    throw error;
  }
}
