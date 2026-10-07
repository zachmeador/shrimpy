import { createConnection, type Socket } from "node:net";
import { pipeline } from "node:stream";
import { DEFAULT_MAX_FRAME_LENGTH } from "@earendil-works/pi-protocol";
import { createWebSocketStream, WebSocket } from "ws";
import { type Address, answerPath, formatAddress } from "../../contracts/gateway/index.ts";
import type { KeptRegistration } from "../../contracts/gateway/node.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { type Backoff, keepRunning } from "../../lib/retry/index.ts";

export interface AnsweringOptions {
  /**
   * The agent's connection to the gateway. The agent asks for its calls over
   * it, and over each new one it registers on after it lost the gateway.
   */
  gateway: Pick<KeptRegistration, "untilUp">;
  /** The gateway's network entry, which each call is answered on. */
  entry: Address;
  /** The socket of the agent's own server that connections through the gateway come in on, which asks for a ticket first. */
  socket: string;
  /** Told why asking for calls failed, or a call could not be answered, once for each reason and not again while the same one repeats. */
  onError(error: Error): void;
  /** The pauses between attempts to ask. Tests shorten them. */
  backoff?: Backoff;
}

/** An agent that answers the calls the gateway makes for it. */
export interface Answering {
  /** Stop asking, and end the connections that answered calls. Resolves once asking has stopped. */
  close(): Promise<void>;
}

/**
 * Answer the calls the gateway makes for an agent that is apart from it, which
 * it can't dial: ask the gateway for them over the connection the agent is
 * registered on, and for each one open one more connection to the gateway's
 * entry, at the path that carries the call's ID, and join it byte for byte to
 * the agent's own server. Nothing is read from the bytes, so who the caller is
 * and what it may do are for the server to settle with the gateway, as they are
 * for a client that came by the gateway's socket. Calls are answered as they
 * come, however many are open at once. Asking goes on for as long as the agent
 * is registered, and starts again by itself when it registers anew. Closing
 * ends the connections that answered.
 */
export function answerCalls(options: AnsweringOptions): Answering {
  const stopping = new AbortController();
  // What ends each connection that is answering a call, so that closing ends them too.
  const open = new Set<() => void>();
  const told = (error: Error): void => options.onError(error);
  const asking = tellOnce(told);
  const answers = tellOnce(told);

  /** Open the connection that answers `call`, and join it to the agent's own server. */
  function answer(call: string): void {
    if (stopping.signal.aborted) return;
    const web = new WebSocket(`ws://${formatAddress(options.entry)}${answerPath(call)}`, {
      // One protocol frame plus its length prefix is the most a client sends in one message.
      maxPayload: DEFAULT_MAX_FRAME_LENGTH + 4,
    });
    let local: Socket | undefined;
    let opened = false;
    const end = (): void => {
      web.terminate();
      local?.destroy();
    };
    open.add(end);
    web.once("close", () => open.delete(end));
    // The gateway may refuse it: the call ran out, or was answered already.
    web.on("error", (error) => {
      if (!opened && !stopping.signal.aborted) answers.tell(new Error(`Could not answer a call from the gateway: ${error.message}`));
    });
    web.once("open", () => {
      opened = true;
      // Whatever the gateway sends from here on waits in the stream until the server's socket takes it.
      const stream = createWebSocketStream(web);
      const own = createConnection(options.socket);
      local = own;
      let connected = false;
      own.once("connect", () => {
        connected = true;
        answers.recovered();
      });
      // A client that leaves ends the pipe with an error too, and is no business of the agent's. A server that is not there is.
      own.on("error", (error) => {
        if (!connected && !stopping.signal.aborted) {
          answers.tell(new Error(`Could not join a call from the gateway to the agent's own server: ${error.message}`));
        }
      });
      pipeline(stream, own, stream, end);
    });
  }

  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      // The connection to the gateway is gone, which is the registration's to say, and asking resumes with the next one.
      if (isDisconnected(error)) return;
      asking.tell(new Error(`Could not ask the gateway for calls: ${error instanceof Error ? error.message : String(error)}`));
    },
    async attempt(established, signal) {
      const gateway = await options.gateway.untilUp(signal);
      try {
        for (;;) {
          const calls = await gateway.calls(signal);
          established();
          asking.recovered();
          for (const call of calls) answer(call);
        }
      } catch (error) {
        // Losing the connection is not asking going wrong: the next one is asked at once, and only a refusal makes the pauses grow.
        if (isDisconnected(error)) established();
        throw error;
      }
    },
  });

  return {
    async close() {
      stopping.abort();
      await running;
      for (const end of [...open]) end();
    },
  };
}

/** Tells of a failure once, and tells of it again only when it changes or what failed has worked since. */
function tellOnce(tell: (error: Error) => void): { tell(error: Error): void; recovered(): void } {
  let last: string | undefined;
  return {
    tell(error) {
      if (error.message === last) return;
      last = error.message;
      tell(error);
    },
    recovered() {
      last = undefined;
    },
  };
}
