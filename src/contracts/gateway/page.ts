import { compile, nul, num, opt, str, union } from "@earendil-works/pi-schema";
import { dialFromPage, type PageSocket } from "../../lib/link/index.ts";
import { hello, type Welcomed, welcomeIn, type Who } from "./hello.ts";
import { openObject } from "./open.ts";

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

const checkJoin = compile(openObject({ code: str(), label: str() })).check;

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
  openObject({ endpoint: str(), expirationTime: opt(union([num(), nul()])), keys: openObject({ p256dh: str(), auth: str() }) }),
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

export interface PageHelloOptions {
  /** Abort to give up while the connection opens or the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Make the WebSocket: the browser's own, unless this is given. */
  readonly socket?: (url: string) => PageSocket;
}

/**
 * Say the hello from a page at the page's link, `url`, as `who`, and read the
 * answer as every hello's is read: a refusal is a `HelloRefusedError`, an
 * answer this code can't read is an `UnknownAnswerError`, and either way the
 * link is dropped. The hello shows no token: the door knows the browser by the
 * cookie it keeps for the link, which the browser sends by itself.
 */
export async function helloFromPage(url: string, who: Who, options: PageHelloOptions = {}): Promise<Welcomed> {
  const { answer, linked } = await dialFromPage(url, hello(who, null), options);
  return welcomeIn(answer, linked);
}
