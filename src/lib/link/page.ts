import { webSocketLink, type WebSocketLike } from "@earendil-works/chord";
import type { JsonValue } from "@earendil-works/chord/json";
import { asError } from "../errors/index.ts";
import { ANSWER_MS, answerIn, closedBeforeAnswering, didNotAnswer } from "./dialing.ts";
import type { Linked } from "./linked.ts";

/** The part of a browser's WebSocket a dial uses: what Chord's link uses, and a text frame for the hello. */
export interface PageSocket extends WebSocketLike {
  send(data: string | Uint8Array<ArrayBuffer>): void;
}

export interface PageDialOptions {
  /** Abort to give up, while the connection opens or while the answer is awaited. */
  signal?: AbortSignal;
  /** How long to wait for the answer, from when dialing starts. A quarter of a minute if not given. */
  answerMs?: number;
  /** Make the WebSocket to the URL: the browser's own, unless this is given. */
  socket?: (url: string) => PageSocket;
}

/** What the other end answered to the hello, and the link that follows it, whatever the answer was. */
export interface PageDialed {
  readonly answer: unknown;
  readonly linked: Linked;
}

const CLOSED = 3;

/**
 * Open a WebSocket to `url` from a page, send `hello` as the first frame and
 * wait for the answer, which is JSON text too. The browser says by itself
 * where the page comes from, and sends the cookies it keeps for `url`. The
 * socket becomes a link in the same turn as the answer arrives, so no frame
 * after it is missed; the caller reads the answer and connects the link or
 * drops it. A socket that closes, fails, answers with anything but JSON text
 * or doesn't answer in time is dropped, and so is one whose `signal` aborts
 * first. A browser tells a page nothing of why a socket closed before it
 * opened, such as a door that turned the page away, so neither can this.
 */
export function dialFromPage(url: string, hello: JsonValue, options: PageDialOptions = {}): Promise<PageDialed> {
  const { signal } = options;
  const answerMs = options.answerMs ?? ANSWER_MS;
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) return reject(asError(signal.reason));
    const socket: PageSocket = options.socket?.(url) ?? new WebSocket(url);
    socket.binaryType = "arraybuffer";
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(late);
      signal?.removeEventListener("abort", aborted);
      socket.removeEventListener("open", opened);
      socket.removeEventListener("error", closed);
      socket.removeEventListener("close", closed);
      socket.removeEventListener("message", answered);
      return true;
    };
    const fail = (error: Error): void => {
      if (!finish()) return;
      socket.close();
      reject(error);
    };
    const late = setTimeout(() => fail(didNotAnswer(url, answerMs)), answerMs);
    const aborted = (): void => fail(asError(signal?.reason));
    const opened = (): void => socket.send(JSON.stringify(hello));
    // A browser follows an error with a close, and says no more of either.
    const closed = (): void => fail(closedBeforeAnswering(url));
    const answered = (event: { readonly data: unknown }): void => {
      let answer: unknown;
      try {
        answer = answerIn(url, typeof event.data === "string" ? event.data : undefined);
      } catch (error) {
        return fail(asError(error));
      }
      finish();
      resolve({ answer, linked: linkOver(socket) });
    };
    signal?.addEventListener("abort", aborted, { once: true });
    socket.addEventListener("open", opened);
    socket.addEventListener("error", closed);
    socket.addEventListener("close", closed);
    socket.addEventListener("message", answered);
  });
}

/** `socket` as a Chord link, made in the same turn as the answer, so no frame after it is missed. */
function linkOver(socket: PageSocket): Linked {
  const closed = new Promise<void>((resolve) => {
    if (socket.readyState === CLOSED) resolve();
    else socket.addEventListener("close", () => resolve());
  });
  const link = webSocketLink(socket);
  return { link, closed, drop: () => link.close() };
}
