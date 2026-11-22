import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import {
  type HelloAnswer,
  PAGE_JOIN,
  PAGE_LINK,
  PAGE_PUSH,
  type PageFile,
  type PagePush,
  type PagePushKey,
  readPageJoin,
  readPagePush,
} from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { fromItsOwnPage, type Greeted, listen } from "../../lib/link/node.ts";
import { cannotListen } from "../listening/index.ts";
import { readSettings } from "../settings/index.ts";
import { type PagePlace, pagePlace } from "./place.ts";

export interface PageOptions {
  /** The page: the file at "/" and every file it asks for. */
  readonly files: readonly PageFile[];
  /** Your settings file, which says where the door listens and what it serves with, read now. Without one, the door opens where it does with nothing set. */
  readonly settings: string | undefined;
  /** The name of the cookie a browser keeps its token in, which is the gateway's own, so that two on one machine keep theirs apart. */
  readonly cookie: string;
  /** What the gateway answers the page's hello, with the token the browser's cookie keeps, if it sent one. */
  readonly greet: (raw: unknown, kept: string | undefined) => Greeted;
  /** Let a browser in with an invitation's code: the answer, and the browser's new token when it is let in. */
  readonly join: (code: string, label: string) => { answer: HelloAnswer; token?: string };
  /** The key a browser subscribes to push with: the public half of the one the gateway signs notifications with, in base64url. */
  readonly pushKey: string;
  /** Keep where the browser whose cookie keeps `kept` is told things. False when it is no device of yours. */
  readonly keepPush: (kept: string, push: PagePush) => boolean;
  /** Told when answering a request fails, which drops it. */
  readonly onError?: (error: unknown) => void;
}

export interface PageDoor {
  /** Where a browser opens the page: over HTTPS at the certificate's name, or over HTTP on loopback, with the port the door got. */
  readonly url: string;
  /** Stop listening and drop every link it took. */
  close(): Promise<void>;
}

/** The most a page sends in one request. A code and a label, or a push subscription, are well under it. */
const BODY_BYTES = 4096;

/** How long a browser keeps its token: 400 days, the longest a browser keeps a cookie. */
const KEPT_SECONDS = 400 * 24 * 60 * 60;

/** What every answer carries: nothing is kept on the way, nothing is guessed at, and no other page frames this one. */
const ANSWERED: OutgoingHttpHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/**
 * Open the page's door where your settings say, or on loopback at 7448. It
 * serves the page's files, takes an invitation's code from the page at
 * `PAGE_JOIN`, and keeps the token the gateway makes for the browser in a
 * cookie the page's scripts can't read, which the browser sends only with the
 * page's link, at `PAGE_LINK` and below it, and only over HTTPS when the door
 * has a certificate. At `PAGE_PUSH` it tells anyone the key to subscribe to
 * push with, and takes where a browser of yours is told things, knowing it by
 * its cookie. A code, a place, like a link, is taken only from the door's own
 * page. A door that can't open, for settings that can't be used, a certificate
 * that can't be read or an address another program has, is an error that says
 * it stays shut, why, and what opens it.
 */
export async function openPage(options: PageOptions): Promise<PageDoor> {
  const file = options.settings;
  let place: PagePlace;
  try {
    const settings = (file === undefined ? undefined : readSettings(file))?.page ?? {};
    if (settings instanceof Error) throw settings;
    place = pagePlace(settings, file);
  } catch (error) {
    throw new Error(`The page's door stays shut. ${asError(error).message}`, { cause: error });
  }
  const secure = place.certificate !== null;
  const files = new Map(
    options.files.map(({ path, type, body }) => [path, { type, body: typeof body === "string" ? Buffer.from(body) : body }]),
  );
  const cookie = (token: string): string =>
    `${options.cookie}=${token}; Path=${PAGE_LINK}; Max-Age=${String(KEPT_SECONDS)}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;

  const join = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== "POST") return answer(response, 405, { Allow: "POST" });
    if (!fromItsOwnPage(request)) return answer(response, 403);
    const body = await bodyOf(request, BODY_BYTES);
    if (body === undefined) return answer(response, 413, { Connection: "close" });
    const shown = readPageJoin(parsed(body));
    if (shown === undefined) return answer(response, 400);
    const { answer: said, token } = options.join(shown.code, shown.label);
    answer(response, token === undefined ? 403 : 200, token === undefined ? {} : { "Set-Cookie": cookie(token) }, said);
  };

  const push = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method === "GET") return answer(response, 200, {}, { key: options.pushKey });
    if (request.method !== "POST") return answer(response, 405, { Allow: "GET, POST" });
    if (!fromItsOwnPage(request)) return answer(response, 403);
    const body = await bodyOf(request, BODY_BYTES);
    if (body === undefined) return answer(response, 413, { Connection: "close" });
    const place = readPagePush(parsed(body));
    if (place === undefined) return answer(response, 400);
    const kept = cookieIn(request.headers.cookie, options.cookie);
    answer(response, kept !== undefined && options.keepPush(kept, place) ? 204 : 403);
  };

  /** Answer with `respond`, dropping the request if it fails. */
  const handled = (respond: Promise<void>, response: ServerResponse): void => {
    respond.catch((error: unknown) => {
      response.destroy();
      options.onError?.(error);
    });
  };

  const serve = (request: IncomingMessage, response: ServerResponse): void => {
    const path = new URL(request.url ?? "/", "http://page").pathname;
    if (path === PAGE_JOIN) return handled(join(request, response), response);
    if (path === PAGE_PUSH) return handled(push(request, response), response);
    const file = files.get(path);
    if (file === undefined || (request.method !== "GET" && request.method !== "HEAD")) return answer(response, 404);
    response.writeHead(200, { ...ANSWERED, "Content-Type": file.type, "Content-Length": file.body.byteLength });
    response.end(request.method === "HEAD" ? undefined : file.body);
  };

  const listener = await listen(
    { host: place.host, port: place.port, certificate: place.certificate },
    (raw, headers) => options.greet(raw, cookieIn(headers.cookie, options.cookie)),
    { serve, ...(options.onError === undefined ? {} : { onError: options.onError }) },
  ).catch((error: unknown) => {
    throw new Error(
      `${cannotListen(place, error).message} The page's door stays shut: set "listen" under "page" in ${file ?? "the gateway's settings"} ` +
        "to another address, and start the gateway again.",
      { cause: error },
    );
  });
  const { port } = listener.place as { port: number };
  return { url: `${secure ? "https" : "http"}://${formatAddress({ host: place.name, port })}/`, close: () => listener.close() };
}

/** Answer `status`, with `body` as JSON when there is one. A 204 has no body, and says no length. */
function answer(response: ServerResponse, status: number, headers: OutgoingHttpHeaders = {}, body?: HelloAnswer | PagePushKey): void {
  const text = body === undefined ? "" : JSON.stringify(body);
  response.writeHead(status, {
    ...ANSWERED,
    ...headers,
    ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    ...(status === 204 ? {} : { "Content-Length": Buffer.byteLength(text) }),
  });
  response.end(text);
}

/** The body of `request` as text, or undefined once it is longer than `most` bytes, when the rest is not read. */
function bodyOf(request: IncomingMessage, most: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    if (Number(request.headers["content-length"] ?? 0) > most) return resolve(undefined);
    const chunks: Buffer[] = [];
    let size = 0;
    const take = (chunk: Buffer): void => {
      size += chunk.byteLength;
      if (size <= most) return void chunks.push(chunk);
      request.off("data", take);
      resolve(undefined);
    };
    request.on("data", take);
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.once("error", reject);
  });
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The value of the cookie `name` in a request's `Cookie` header, if it has one. */
function cookieIn(header: string | undefined, name: string): string | undefined {
  for (const pair of header?.split(";") ?? []) {
    const at = pair.indexOf("=");
    if (at !== -1 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}
