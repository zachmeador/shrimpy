import { type HostError, nul, num, obj, opt, str, union } from "@earendil-works/chord";
import { compile } from "@earendil-works/pi-schema";
import { dialFromPage, type PageSocket } from "../../lib/link/index.ts";
import { type Answer, done, refused } from "./answers.ts";
import { type Client, clientOver } from "./client.ts";
import { hello, readAnswer, unreadableAnswer } from "./hello.ts";

/**
 * A file of the web client's page, as the gateway serves it at the page's
 * door: what is served at `path`, with its media type. The page is the file at
 * "/" and every file it asks for, made by the web client and handed to the
 * gateway by whoever starts it.
 */
export interface PageFile {
  readonly path: string;
  readonly type: string;
  readonly body: string | Uint8Array;
}

/** Where the page's door takes the code that lets a browser in, as a POST of a `PageJoin` in JSON. */
export const PAGE_JOIN = "/join";

/** Where the page's door takes the page's link. */
export const PAGE_LINK = "/link";

/**
 * What a page shows the door to let its browser in as a device of yours: an
 * invitation's code, and a label for the browser, which you read among your
 * devices. The door answers as it answers a hello, and keeps the browser's new
 * token in a cookie the page's scripts can't read.
 */
export type PageJoin = { code: string; label: string };

const checkJoin = compile(obj({ code: str(), label: str() })).check;

/** A `PageJoin` from `value`, which arrived as JSON from anyone, or undefined when it isn't one. */
export function readPageJoin(value: unknown): PageJoin | undefined {
  return checkJoin(value) ? (value as PageJoin) : undefined;
}

/**
 * Where the page's door tells a browser the key to subscribe to push with,
 * answering a GET with a `PagePushKey` in JSON, and takes where the browser is
 * told things, as a POST of a `PagePush` in JSON. It is under the page's link,
 * so the browser sends the cookie it keeps for the link, which says whose
 * place it is.
 */
export const PAGE_PUSH = "/link/push";

/** The key a browser subscribes to push with, as `applicationServerKey` takes it: the gateway's public key, in base64url. */
export type PagePushKey = { key: string };

/**
 * Where a browser is told things: its push subscription, as
 * `PushSubscription.toJSON()` gives it. The door keeps its endpoint and its
 * keys for the browser, in place of any it kept before.
 */
export type PagePush = { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } };

const checkPush = compile(
  obj({ endpoint: str(), expirationTime: opt(union([num(), nul()])), keys: obj({ p256dh: str(), auth: str() }) }),
).check;

/** A key on P-256, uncompressed, in base64url: 65 bytes, the first of them 4. Padding is left off, or not. */
const PUBLIC_KEY = /^B[A-Za-z0-9_-]{86}=?$/;

/** A browser's secret for push, in base64url: 16 bytes. */
const SECRET = /^[A-Za-z0-9_-]{22}(==)?$/;

/**
 * A `PagePush` from `value`, which arrived as JSON from anyone, or undefined
 * when it isn't one: an http or https endpoint, and keys of the lengths push
 * uses.
 */
export function readPagePush(value: unknown): PagePush | undefined {
  if (!checkPush(value)) return undefined;
  const push = value as PagePush;
  let endpoint: URL;
  try {
    endpoint = new URL(push.endpoint);
  } catch {
    return undefined;
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") return undefined;
  return PUBLIC_KEY.test(push.keys.p256dh) && SECRET.test(push.keys.auth) ? push : undefined;
}

/** The URL of the page's link, for the page at `page`, such as the page's own `location`. */
export function pageLinkUrl(page: { readonly protocol: string; readonly host: string }): string {
  return `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}${PAGE_LINK}`;
}

export interface PageConnectOptions {
  /** The page's link, as `pageLinkUrl` writes it. */
  readonly url: string;
  /** Abort to give up while the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Told of what fails in the client's host in the background. */
  readonly onError?: (error: HostError) => void;
  /** Make the WebSocket: the browser's own, unless this is given. */
  readonly socket?: (url: string) => PageSocket;
}

/**
 * Link a page to the gateway once, at the page's door: the hello, then Chord
 * with the gateway as the client's parent. The hello shows no token: the door
 * knows the browser by the cookie it keeps for the link, which the browser
 * sends by itself. A hello turned away is the gateway's refusal, in its words.
 * An answer this code can't read, and a link that can't be made, throw.
 */
export async function connectFromPage(options: PageConnectOptions): Promise<Answer<Client>> {
  const { answer: raw, linked } = await dialFromPage(options.url, hello({ kind: "client", token: null }), {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.socket === undefined ? {} : { socket: options.socket }),
  });
  const answer = readAnswer(raw);
  if (answer?.kind === "welcome") {
    return done(await clientOver(answer, linked, { parent: "gateway", ...(options.onError === undefined ? {} : { onError: options.onError }) }));
  }
  linked.drop();
  if (answer === undefined) throw new Error(unreadableAnswer(raw));
  return refused(answer.words, answer.reason);
}
