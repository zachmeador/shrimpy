import type { createConnection } from "node:net";
import { connect } from "node:tls";
import type { JsonValue } from "@earendil-works/chord/json";
import { WebSocket } from "ws";
import { asError } from "../errors/index.ts";
import { codeOf } from "../files/index.ts";
import { fingerprintOf } from "../tls/node.ts";
import { type Linked, linkOver, MAX_FRAME, textOf } from "./linked.node.ts";
import { describePlace, placeUrl } from "./place.ts";

/**
 * Where to dial: a Unix socket's path, or a host and a port, where the link is
 * TLS and the other end proves itself with the key whose fingerprint is
 * `fingerprint`, as `fingerprintOf` writes it.
 */
export type DialPlace = { readonly path: string } | { readonly host: string; readonly port: number; readonly fingerprint: string };

export interface DialOptions {
  /** Abort to give up, while the connection opens or while the answer is awaited. */
  signal?: AbortSignal;
  /** How long to wait for the answer, from when dialing starts. A quarter of a minute if not given. */
  answerMs?: number;
}

/** What the other end answered to the hello, and the link that follows it, whatever the answer was. */
export interface Dialed {
  readonly answer: unknown;
  readonly linked: Linked;
}

/** The other end of a link showed another key than the one it was dialed for, so the hello was never sent. */
export class OtherKeyError extends Error {
  /** The fingerprint the link was dialed for. */
  readonly expected: string;
  /** The fingerprint of the key the other end showed, or undefined when it showed none. */
  readonly shown: string | undefined;

  constructor(where: string, expected: string, shown: string | undefined) {
    super(`${where} showed ${shown === undefined ? "no key" : `the key ${shown}`} where ${expected} was expected, and was sent nothing.`);
    this.name = "OtherKeyError";
    this.expected = expected;
    this.shown = shown;
  }
}

const ANSWER_MS = 15_000;

/** Whether `error`, from dialing a socket's path, means nothing listens there. */
export function nobodyThere(error: unknown): boolean {
  const code = codeOf(error instanceof Error ? error.cause : undefined);
  return code === "ECONNREFUSED" || code === "ENOENT";
}

/**
 * Open a WebSocket to `place`, send `hello` as the first frame and wait for
 * the answer, which is JSON text too. At an address the WebSocket is TLS, and a
 * key with another fingerprint drops it as soon as the handshake shows it,
 * which is an `OtherKeyError`: the hello is sent only to the key it is meant
 * for. The socket becomes a link in the same turn as the answer arrives, so no
 * frame after it is missed; the caller reads the answer and connects the link
 * or drops it. A socket that closes, fails, answers with anything but JSON text
 * or doesn't answer in time is dropped, and so is one whose `signal` aborts
 * first.
 */
export function dial(place: DialPlace, hello: JsonValue, options: DialOptions = {}): Promise<Dialed> {
  const { signal } = options;
  const where = describePlace(place);
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) return reject(asError(signal.reason));
    let otherKey: OtherKeyError | undefined;
    const proving =
      "path" in place
        ? {}
        : { createConnection: proven(place, (shown) => (otherKey = new OtherKeyError(where, place.fingerprint, shown))) };
    const socket = new WebSocket(placeUrl(place), { maxPayload: MAX_FRAME, ...proving });
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(late);
      signal?.removeEventListener("abort", aborted);
      socket.off("close", closed);
      return true;
    };
    const fail = (error: Error): void => {
      if (!finish()) return;
      socket.terminate();
      reject(error);
    };
    const late = setTimeout(
      () => fail(new Error(`${where} did not answer within ${String((options.answerMs ?? ANSWER_MS) / 1000)} seconds.`)),
      options.answerMs ?? ANSWER_MS,
    );
    const aborted = (): void => fail(asError(signal?.reason));
    const closed = (): void => fail(otherKey ?? new Error(`${where} closed the connection before it answered.`));
    signal?.addEventListener("abort", aborted, { once: true });
    // An error is followed by a close; without a listener it would end the process.
    socket.on("error", (error) => fail(otherKey ?? new Error(`Could not reach ${where}: ${error.message}`, { cause: error })));
    socket.on("close", closed);
    socket.once("open", () => socket.send(JSON.stringify(hello)));
    socket.once("message", (data, isBinary) => {
      if (settled) return;
      if (isBinary) return fail(new Error(`${where} answered with something other than a hello's answer.`));
      let answer: unknown;
      try {
        answer = JSON.parse(textOf(data));
      } catch {
        return fail(new Error(`${where} answered with something other than JSON.`));
      }
      finish();
      resolve({ answer, linked: linkOver(socket) });
    });
  });
}

/**
 * How the WebSocket to an address connects: TLS 1.3, sending no server name,
 * with the certificate taken as it comes and the key in it checked instead.
 * When the handshake is done, a key whose fingerprint isn't `place`'s is told
 * to `other` and the connection is dropped there, before the WebSocket can open
 * and the hello be sent.
 */
function proven(place: { host: string; port: number; fingerprint: string }, other: (shown: string | undefined) => void) {
  const connecting = (): ReturnType<typeof connect> => {
    const socket = connect({ host: place.host, port: place.port, servername: "", rejectUnauthorized: false, minVersion: "TLSv1.3" });
    socket.once("secureConnect", () => {
      const key = socket.getPeerX509Certificate()?.publicKey;
      const shown = key === undefined ? undefined : fingerprintOf(key);
      if (shown === place.fingerprint) return;
      other(shown);
      socket.destroy();
    });
    return socket;
  };
  // ws asks for net's signature, and takes any socket it can write the request to.
  return connecting as unknown as typeof createConnection;
}
