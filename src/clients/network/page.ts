import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { HelloRefusedError, helloFromPage } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { keepLink, type PageSocket } from "../../lib/link/index.ts";
import type { Dial } from "./link.ts";

/**
 * How a page keeps linked to the gateway, at its door's link `url`: the hello
 * from the page, then Chord, and the same again after a drop or a refusal,
 * after a pause that grows while hellos fail. `socket` makes the WebSocket,
 * and is the browser's own unless given. A browser tells a page nothing of why
 * a socket closed before it answered, so a gateway that can't be reached says
 * only that.
 */
export function dialPage(url: string, socket?: (url: string) => PageSocket): Dial {
  return (options) =>
    keepLink({
      signal: options.signal,
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
      onError: (error) =>
        options.onError(
          error instanceof HelloRefusedError ? { kind: "refused", words: error.message } : { kind: "unreachable", message: asError(error).message },
        ),
      async link(attempt) {
        const { welcome, linked } = await helloFromPage(url, options.who(), { signal: attempt, ...(socket === undefined ? {} : { socket }) });
        if (attempt.aborted) {
          linked.drop();
          throw attempt.reason;
        }
        options.host.connect(linked.link, { principal: { kind: "gateway" } }, BACKGROUND_CONTEXT);
        options.onWelcome(welcome, linked.closed);
        return linked;
      },
    });
}
