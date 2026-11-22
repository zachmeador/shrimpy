import { createDecipheriv, createECDH, createHmac, createPublicKey, type ECDH, randomBytes, verify } from "node:crypto";
import { createServer, type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import type { TestContext } from "node:test";
import { stopAfter, until } from "../../../lib/testing/index.ts";
import { type Notification, PAGE_JOIN, PAGE_PUSH, type PagePushKey } from "../index.ts";

const hmac = (key: Uint8Array, ...data: Uint8Array[]): Buffer => {
  const mac = createHmac("sha256", key);
  for (const part of data) mac.update(part);
  return mac.digest();
};

/**
 * What a push message says, read as a browser reads it under RFC 8291, with
 * the browser's private key and its secret, each in base64url. Throws for a
 * message that wasn't encrypted for that browser.
 */
export function readPushMessage(body: Uint8Array, privateKey: string, auth: string): Buffer {
  const browser = createECDH("prime256v1");
  browser.setPrivateKey(Buffer.from(privateKey, "base64url"));
  return decrypt(Buffer.from(body), browser, Buffer.from(auth, "base64url"));
}

function decrypt(body: Buffer, browser: ECDH, auth: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const sender = body.subarray(21, 21 + keyLength);
  const sealed = body.subarray(21 + keyLength);
  const ikm = hmac(hmac(auth, browser.computeSecret(sender)), Buffer.from("WebPush: info\0"), browser.getPublicKey(), sender, Buffer.from([1]));
  const prk = hmac(salt, ikm);
  const key = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(sealed.subarray(-16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  let end = padded.length - 1;
  while (end > 0 && padded[end] === 0) end -= 1;
  if (padded[end] !== 2) throw new Error("The message doesn't end as the last record does.");
  return padded.subarray(0, end);
}

/**
 * Why a request isn't one a push service takes, as RFC 8030 and RFC 8292 have
 * it, or undefined when it is: encrypted as aes128gcm, with a lifetime, and
 * signed by `key` for `origin`, for no more than a day.
 */
function refusal(request: IncomingMessage, origin: string, key: string): string | undefined {
  if (request.headers["content-encoding"] !== "aes128gcm") return "it isn't encrypted as aes128gcm";
  const { ttl } = request.headers;
  if (typeof ttl !== "string" || !/^\d+$/.test(ttl)) return "it has no TTL";
  const vapid = /^vapid t=([^,\s]+),\s*k=([A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? "");
  if (vapid === null) return "it doesn't say who sent it as vapid";
  const [, token = "", shown = ""] = vapid;
  if (shown !== key) return "it is signed by a key the browser didn't subscribe with";
  const [header = "", claims = "", signature = ""] = token.split(".");
  const point = Buffer.from(shown, "base64url");
  const signer = createPublicKey({
    key: { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") },
    format: "jwk",
  });
  const signed = verify("sha256", Buffer.from(`${header}.${claims}`), { key: signer, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
  if (!signed) return "its token's signature is wrong";
  const said = JSON.parse(Buffer.from(claims, "base64url").toString("utf8")) as { aud?: unknown; exp?: unknown };
  if (said.aud !== origin) return `its token is for ${String(said.aud)}`;
  const now = Date.now() / 1000;
  if (typeof said.exp !== "number" || said.exp < now || said.exp > now + 24 * 60 * 60) return "its token's expiry isn't within a day";
  return undefined;
}

/** A browser of yours on the gateway's page, told things through the push service a test stands in for. */
export interface TestBrowser {
  /** What it called itself when it was let in, which labels its way in. */
  readonly label: string;
  /** Every request the push service had for it, taken or not. */
  attempts(): number;
  /** What reached it, read as a browser reads it, oldest first. */
  notifications(): readonly Notification[];
  /** Resolve with what reached it once `count` notifications have. */
  untilNotified(count: number): Promise<readonly Notification[]>;
  /** From now on the push service answers that this browser's subscription is gone. */
  unsubscribe(): void;
}

/** A push service a test stands in for, on loopback, which takes only what a real one would. */
export interface TestPushService {
  /**
   * A browser let into the gateway's page at `page` with an invitation's
   * `code`, as the page lets it in, and subscribed here with the key the
   * page's door gives, as the page subscribes it.
   */
  subscribe(page: string, code: string, label: string): Promise<TestBrowser>;
  /** Every request it turned away, and why. A test expects none. */
  refused(): readonly string[];
}

/** What a test's request to the page's door sends: a body as JSON, the browser's cookie, and the page it says it comes from. */
export interface PageAsking {
  readonly body?: unknown;
  readonly cookie?: string;
  /** The page's own origin unless a test says another. */
  readonly origin?: string;
}

/** What the page's door answered a test's request: the status, the body as text, and the cookie it set, whole. */
export interface PageAnswer {
  readonly status: number | undefined;
  readonly text: string;
  readonly setCookie: string | undefined;
}

/**
 * A request to `path` at the page's door at `page`, as the page makes it.
 * Over HTTPS, the door's certificate is taken whatever it is, since nothing
 * in a test trusts one.
 */
export function askPage(page: string, path: string, method: string, asking: PageAsking = {}): Promise<PageAnswer> {
  const url = new URL(path, page);
  const text = asking.body === undefined ? undefined : JSON.stringify(asking.body);
  const headers = {
    origin: asking.origin ?? url.origin,
    ...(asking.cookie === undefined ? {} : { cookie: asking.cookie }),
    ...(text === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(text) }),
  };
  return new Promise((resolve, reject) => {
    const answered = (response: IncomingMessage): void => {
      let answer = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (answer += chunk));
      response.on("end", () => resolve({ status: response.statusCode, text: answer, setCookie: response.headers["set-cookie"]?.[0] }));
    };
    const sent =
      url.protocol === "https:"
        ? httpsRequest(url, { method, headers, rejectUnauthorized: false }, answered)
        : httpRequest(url, { method, headers }, answered);
    sent.on("error", reject);
    sent.end(text);
  });
}

/** A push service on loopback that browsers subscribe with, stopped when the test ends. */
export async function startTestPushService(t: TestContext): Promise<TestPushService> {
  const browsers = new Map<string, { browser: ECDH; auth: Buffer; key: string; gone: boolean; attempts: number; told: Notification[] }>();
  const refused: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const subscriber = browsers.get(request.url ?? "");
      if (request.method !== "POST" || subscriber === undefined) return void response.writeHead(404).end();
      subscriber.attempts += 1;
      if (subscriber.gone) return void response.writeHead(410).end();
      try {
        const why = refusal(request, origin, subscriber.key);
        if (why !== undefined) throw new Error(why);
        subscriber.told.push(JSON.parse(decrypt(Buffer.concat(chunks), subscriber.browser, subscriber.auth).toString("utf8")) as Notification);
      } catch (error) {
        refused.push(`${request.url ?? ""}: ${String(error)}`);
        return void response.writeHead(403).end();
      }
      response.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stopAfter(t, () => new Promise<void>((resolve) => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  return {
    refused: () => refused,
    async subscribe(page, code, label) {
      const joined = await askPage(page, PAGE_JOIN, "POST", { body: { code, label } });
      const cookie = joined.setCookie?.split(";")[0];
      if (joined.status !== 200 || cookie === undefined) throw new Error(`The page's door didn't let ${label} in: ${joined.text}`);
      const asked = await askPage(page, PAGE_PUSH, "GET");
      const { key } = JSON.parse(asked.text) as PagePushKey;
      const browser = createECDH("prime256v1");
      browser.generateKeys();
      const auth = randomBytes(16);
      const path = `/push/${label}`;
      const subscriber = { browser, auth, key, gone: false, attempts: 0, told: [] as Notification[] };
      browsers.set(path, subscriber);
      const subscription = {
        endpoint: `${origin}${path}`,
        expirationTime: null,
        keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
      };
      const kept = await askPage(page, PAGE_PUSH, "POST", { body: subscription, cookie });
      if (kept.status !== 204) throw new Error(`The page's door didn't keep where ${label} is told things: ${String(kept.status)}`);
      return {
        label,
        attempts: () => subscriber.attempts,
        notifications: () => subscriber.told,
        async untilNotified(count) {
          await until(() => subscriber.told.length >= count, `${String(count)} notifications to reach ${label}`);
          return subscriber.told;
        },
        unsubscribe() {
          subscriber.gone = true;
        },
      };
    },
  };
}
