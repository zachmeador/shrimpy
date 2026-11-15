import { readFileSync } from "node:fs";
import { createHost, type Host, type HostError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { dial } from "../../lib/link/node.ts";
import { hello, type Principal, readAnswer, type Revocation, unreadableAnswer } from "../gateway/index.ts";
import { UnknownAnswerError } from "../gateway/node.ts";
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
 * be stale: only a link shows that an agent is there.
 */
export function readEndpoint(home: string): AgentEndpoint | undefined {
  try {
    return JSON.parse(readFileSync(endpointFile(home), "utf8")) as AgentEndpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** A client's link to one agent by its home's path, through which it holds that agent's objects as `home`. */
export interface HomeClient {
  /** The client's host, which serves nothing and holds what it is given. */
  readonly host: Host<Principal, Revocation>;
  /** The name the agent answers to, which its objects' `agent` param takes. */
  readonly name: string;
  /** Settles once the link has closed, whoever closed it. Nothing links again by itself. */
  readonly closed: Promise<void>;
  /** Close the host and drop the link at once. Closing twice closes once. */
  close(): Promise<void>;
}

export interface ConnectHomeOptions {
  /** Abort to give up while the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Told of what fails in the client's host in the background. */
  readonly onError?: (error: HostError) => void;
}

/** Whether `error`, from dialing a socket's path, means nothing listens there. */
function nobodyThere(error: unknown): boolean {
  const code = ((error as Error).cause as NodeJS.ErrnoException | undefined)?.code;
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
  let dialed: Awaited<ReturnType<typeof dial>>;
  try {
    dialed = await dial({ path: endpoint.socket }, hello({ kind: "client", token: null }), {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    if (nobodyThere(error)) throw new AgentNotRunningError(home, { cause: error });
    throw error;
  }
  const { answer: raw, linked } = dialed;
  const answer = readAnswer(raw);
  if (answer?.kind !== "welcome") {
    linked.drop();
    if (answer === undefined) throw new UnknownAnswerError(unreadableAnswer(raw, `The agent at ${home}`));
    throw new Error(answer.words);
  }
  const host = createHost<Principal, Revocation>({ onError: options.onError ?? (() => undefined) });
  await host.load([], BACKGROUND_CONTEXT);
  host.connect(linked.link, { principal: { kind: "home" } }, BACKGROUND_CONTEXT);
  let closing: Promise<void> | undefined;
  return {
    host,
    name: endpoint.name,
    closed: linked.closed,
    close() {
      closing ??= (async () => {
        linked.drop();
        await host.close(BACKGROUND_CONTEXT);
      })();
      return closing;
    },
  };
}
