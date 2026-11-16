import { rmSync } from "node:fs";
import { createHost, type Facet, type Host, type HostError } from "@earendil-works/chord";
import { nodeCompression } from "@earendil-works/chord/compression";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type AgentEndpoint, endpointFile } from "../contracts/agent/index.ts";
import {
  agent,
  otherPi,
  type Principal,
  readHello,
  readVersions,
  type Revocation,
  revokedBy,
  samePi,
  turnAway,
  welcome,
} from "../contracts/gateway/index.ts";
import { asError } from "../lib/errors/index.ts";
import { saveFile } from "../lib/files/node.ts";
import { type Greeted, type Listener, listen } from "../lib/link/node.ts";
import { socketPathFor } from "../lib/runtime/node.ts";

const context = BACKGROUND_CONTEXT;

/** What answers a hello on the home's socket, for the words that tell another release what to run where. */
const ANSWERING = { who: "The agent", where: "where the agent runs" };

/** The agent's host, at `agent({ name })`, and the home's own socket. */
export interface AgentServer {
  /** The host the agent's objects are served from, and its own requests go out from as the agent. */
  readonly host: Host<Principal, Revocation>;
  /** Where the agent is reached by its home's path. */
  readonly endpoint: AgentEndpoint;
  /** Stop listening on the home's socket and close the host, which ends every object and drops every link. */
  close(): Promise<void>;
}

export interface ServerOptions {
  /** The agent's home. */
  home: string;
  /** The name the agent answers to, which is its host's address. */
  name: string;
  /** The agent's objects. */
  facet: Facet<Principal>;
  /** Told of what fails in the background. */
  onError(error: Error): void;
}

/**
 * What the home's socket answers a hello with: a client that shows no token is
 * let in and stamped `home`, since whoever may open the socket is whoever the
 * agent runs as. The Pi packages are compared first, so a client of another
 * release is told what to run where, whatever else its hello says.
 */
function greeter(host: Host<Principal, Revocation>): (raw: unknown) => Greeted {
  return (raw) => {
    const versions = readVersions(raw);
    if (versions !== undefined && !samePi(versions.pi)) return { answer: turnAway(otherPi(versions, ANSWERING)) };
    const hello = readHello(raw);
    if (hello === undefined) {
      return { answer: turnAway("That isn't a hello this agent knows, so the other end may be another version of Shrimpy, or not Shrimpy at all.") };
    }
    if (hello.who.kind !== "client" || hello.who.token !== null) {
      return { answer: turnAway("An agent's own socket takes a client that shows no token. Anything else links to the gateway.") };
    }
    return { answer: welcome(null), take: (linked) => host.accept(linked.link, { principal: { kind: "home" } }, context) };
  };
}

/** A failure the host reports in the background, in a sentence. */
function described(error: HostError): Error {
  const cause = "error" in error ? error.error : "failure" in error ? error.failure.error : undefined;
  return new Error(`${error.kind}${cause instanceof Error ? `: ${cause.message}` : ""}`, { cause });
}

/**
 * The agent's host at `agent({ name })`, with its objects loaded, listening on
 * the home's own socket, whose path is written to the home for clients to find
 * with the name the agent answers to. A client that links there holds the
 * agent's objects as `home`, and anything else it holds goes up the agent's own
 * link to the gateway, as the agent. Linking to the gateway is the caller's to
 * start, once the host has loaded.
 */
export async function startServer(options: ServerOptions): Promise<AgentServer> {
  const socket = socketPathFor(options.home);
  const host = createHost<Principal, Revocation>({
    address: agent({ name: options.name }),
    principal: { kind: "home" },
    revokedBy,
    compression: nodeCompression,
    onError: (error) => options.onError(described(error)),
  });
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
    await host.load([{ name: "@shrimpy/agent", facet: options.facet }], context);
    // This process holds the home's lock, so a socket left at the path is stale.
    rmSync(socket, { force: true });
    listener = await listen({ path: socket }, greeter(host), { onError: (error) => options.onError(asError(error)) });
    const endpoint: AgentEndpoint = { socket, name: options.name, pid: process.pid };
    saveFile(endpointFile(options.home), JSON.stringify(endpoint));
    return { host, endpoint, close: closeAll };
  } catch (error) {
    await closeAll().catch(() => undefined);
    throw error;
  }
}
