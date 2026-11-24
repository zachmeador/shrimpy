import { rmSync } from "node:fs";
import { createHost, type Facet, type Host } from "@earendil-works/chord";
import { nodeCompression } from "@earendil-works/chord/compression";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type AgentEndpoint, endpointFile, HOME_AGENT } from "../contracts/agent/index.ts";
import {
  agent,
  notAHello,
  otherRelease,
  type Principal,
  readHello,
  readVersions,
  type Revocation,
  revokedBy,
  turnAway,
  welcome,
} from "../contracts/gateway/index.ts";
import { asError } from "../lib/errors/index.ts";
import { saveFile } from "../lib/files/node.ts";
import { hostFailure } from "../lib/link/index.ts";
import { type Greeted, type Listener, listen } from "../lib/link/node.ts";
import { socketPathFor } from "../lib/runtime/node.ts";

const context = BACKGROUND_CONTEXT;

/** What answers a hello on the home's socket, for the words that tell another release what to run where. */
const ANSWERING = { who: "The agent", where: "where the agent runs" };

/** The home's own socket server, at `agent({ id: HOME_AGENT })`, apart from any gateway. */
export interface AgentServer {
  /** Where the agent is reached by its home's path. */
  readonly endpoint: AgentEndpoint;
  /** Stop listening on the home's socket and close its host, which ends every object and drops every home link. */
  close(): Promise<void>;
}

export interface ServerOptions {
  /** The agent's home. */
  home: string;
  /** The name from agent.json when the agent started, kept in endpoint.json. */
  name: string;
  /** The agent's objects. */
  facet: Facet<Principal>;
  /** Told of what fails in the background. */
  onError(error: Error): void;
}

/**
 * Create and load a Chord host for the agent at `agent({ id })`: `HOME_AGENT`
 * for the home's own socket, or the agent's member ID on the roster for its
 * link to the gateway.
 */
export async function createAgentHost(
  id: string,
  facet: Facet<Principal>,
  onError: (error: Error) => void,
): Promise<Host<Principal, Revocation>> {
  const host = createHost<Principal, Revocation>({
    address: agent({ id }),
    principal: { kind: "home" },
    revokedBy,
    compression: nodeCompression,
    onError: (error) => onError(hostFailure(error)),
  });
  try {
    await host.load([{ name: "@shrimpy/agent", facet }], context);
    return host;
  } catch (error) {
    await host.close(context).catch(() => undefined);
    throw error;
  }
}

/**
 * What the home's socket answers a hello with: a client that shows no token is
 * let in and stamped `home`, since whoever may open the socket is whoever the
 * agent runs as. The versions are compared first, so a client of another
 * release is told what to run where, whatever else its hello says.
 */
function greeter(host: Host<Principal, Revocation>): (raw: unknown) => Greeted {
  return (raw) => {
    const versions = readVersions(raw);
    const other = versions === undefined ? undefined : otherRelease(versions, ANSWERING);
    if (other !== undefined) return { answer: turnAway(other) };
    const hello = readHello(raw);
    if (hello === undefined) {
      return { answer: turnAway(notAHello("this agent")) };
    }
    if (hello.who.kind !== "client" || hello.who.token !== null) {
      return { answer: turnAway("An agent's own socket takes a client that shows no token. Anything else links to the gateway.") };
    }
    return { answer: welcome(null, null), take: (linked) => host.accept(linked.link, { principal: { kind: "home" } }, context) };
  };
}

/**
 * Listen on the home's own socket, serving the agent's objects at
 * `agent({ id: HOME_AGENT })` as `home`, and write the socket path to
 * `endpoint.json`. It has no parent link, so clients here hold only this
 * agent's objects and work with or without a gateway.
 */
export async function startServer(options: ServerOptions): Promise<AgentServer> {
  const socket = socketPathFor(options.home);
  const host = await createAgentHost(HOME_AGENT, options.facet, (error) => options.onError(error));
  let listener: Listener | undefined;
  const closeAll = async (): Promise<void> => {
    try {
      await listener?.close();
    } finally {
      await host.close(context);
      rmSync(socket, { force: true });
    }
  };
  try {
    // This process holds the home's lock, so a socket left at the path is stale.
    rmSync(socket, { force: true });
    listener = await listen({ path: socket }, greeter(host), { onError: (error) => options.onError(asError(error)) });
    const endpoint: AgentEndpoint = { socket, name: options.name, pid: process.pid };
    saveFile(endpointFile(options.home), JSON.stringify(endpoint));
    return { endpoint, close: closeAll };
  } catch (error) {
    await closeAll().catch(() => undefined);
    throw error;
  }
}
