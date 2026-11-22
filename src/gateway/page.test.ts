import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { createHost, type Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { WebSocket as NodeWebSocket } from "ws";
import {
  type HelloAnswer,
  HelloRefusedError,
  helloFromPage,
  type Member,
  PAGE_JOIN,
  PAGE_LINK,
  PAGE_PUSH,
  pageLinkUrl,
  type Principal,
  readAnswer,
  type Revocation,
  Roster,
  valueOf,
} from "../contracts/gateway/index.ts";
import { askPage, connectTestClient, type PageAsking } from "../contracts/gateway/testing/index.ts";
import { formatAddress, type PageSocket } from "../lib/link/index.ts";
import { stopAfter, tempDir, until } from "../lib/testing/index.ts";
import { newKey, selfSignedCertificate } from "../lib/tls/node.ts";
import { type GatewayInProcessOptions, startGatewayInProcess } from "./testing/index.ts";

/*
 * A browser at the page's door, as a browser does it: the page's requests say they come from the page, the code goes
 * in a POST, the token comes back in a cookie, and the link is a WebSocket that carries the cookie. It links as the
 * page does: the hello from the page, `helloFromPage`, handed a WebSocket made as a browser makes one, then a host with
 * the gateway as its parent.
 */

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/** A page small enough to see whole. */
const PAGE = [{ path: "/", type: "text/html; charset=utf-8", body: "<!doctype html><title>page</title>" }];

const LABEL = "a browser on a test";

/** The gateway with the page's door, and the roster as you hold it on the gateway's socket. */
async function withPage(t: TestContext, options: GatewayInProcessOptions = {}) {
  const gateway = await startGatewayInProcess(t, { page: PAGE, ...options });
  assert.ok(gateway.page !== undefined, "the gateway serves the page");
  const you = await connectTestClient(t, { path: gateway.socket });
  const roster = await you.host.get(Roster, {}, context);
  stopAfter(t, () => roster.release());
  return { page: gateway.page, roster };
}

/** Where the page's requests say they come from, as a browser writes it. */
const originOf = (page: string): string => new URL(page).origin;

/** Show the door an invitation's `code` as the page does, from `origin`: the status, the answer, and the cookie it sets. */
async function showCode(page: string, code: string, origin = originOf(page)) {
  const { status, text, setCookie } = await askPage(page, PAGE_JOIN, "POST", { body: { code, label: LABEL }, origin });
  let answer: HelloAnswer | undefined;
  try {
    answer = readAnswer(JSON.parse(text));
  } catch {
    answer = undefined;
  }
  return { status, answer, cookie: setCookie };
}

/** Let a browser in with a new invitation, as you ask for one: the cookie it keeps, as it sends it back. */
async function letIn(page: string, roster: Awaited<ReturnType<typeof withPage>>["roster"]): Promise<string> {
  const { code } = valueOf(await roster.inviteDevice(context));
  const { cookie } = await showCode(page, code);
  assert.ok(cookie !== undefined, "the door sets a cookie");
  return cookie.split(";")[0] ?? "";
}

/** A WebSocket made as a browser makes one for a page from `origin` that keeps `cookie`: the WHATWG one Node has. */
const asBrowser =
  (origin: string | undefined, cookie: string | undefined) =>
  (url: string): PageSocket =>
    new WebSocket(url, { headers: { ...(origin === undefined ? {} : { origin }), ...(cookie === undefined ? {} : { cookie }) } });

/** A page linked to the door: who the gateway takes it for, its host, and what settles once its link has closed. */
interface PageLinked {
  you: Member | null;
  host: Host<Principal, Revocation>;
  closed: Promise<void>;
}

/** The page's link to the door, made as the page makes it: its refusal when the gateway turns it away, and else closed when the test ends. */
async function linkFromPage(t: TestContext, page: string, socket: (url: string) => PageSocket): Promise<PageLinked | HelloRefusedError> {
  let welcomed;
  try {
    welcomed = await helloFromPage(pageLinkUrl(new URL(page)), { kind: "client", token: null }, { socket });
  } catch (error) {
    if (error instanceof HelloRefusedError) return error;
    throw error;
  }
  const { welcome, linked } = welcomed;
  const host = createHost<Principal, Revocation>({ onError: () => undefined });
  await host.load([], context);
  host.connect(linked.link, { principal: { kind: "gateway" } }, context);
  stopAfter(t, async () => {
    linked.drop();
    await host.close(context);
  });
  return { you: welcome.you, host, closed: linked.closed };
}

test("a browser is let in once by an invitation's code, and not twice", { timeout }, async (t) => {
  const { page, roster } = await withPage(t);
  const { code } = valueOf(await roster.inviteDevice(context));

  const first = await showCode(page, code);
  assert.equal(first.status, 200);
  assert.equal(first.answer?.kind === "welcome" ? first.answer.you?.id : first.answer, roster.you.value?.id, "the browser is you");
  assert.ok(first.cookie !== undefined);
  const attributes = first.cookie.split(";").map((part) => part.trim());
  assert.ok(attributes.includes("HttpOnly"), "the page's scripts can't read the token");
  assert.ok(attributes.includes("SameSite=Strict") && attributes.includes("Path=/link"), "it goes only with the page's link");
  assert.ok(!attributes.includes("Secure"), "on loopback, without a certificate, it goes over plain HTTP");
  await until(() => roster.ways.value.some((way) => way.kind === "device" && way.label === LABEL), "the browser among your devices");

  const again = await showCode(page, code);
  assert.equal(again.answer?.kind, "refused", "the code is good once");
  assert.equal(again.cookie, undefined);
});

test("the page's link from the page, with the browser's cookie, is you, and holds the roster", { timeout }, async (t) => {
  const { page, roster } = await withPage(t);
  const cookie = await letIn(page, roster);

  const linked = await linkFromPage(t, page, asBrowser(originOf(page), cookie));

  assert.ok(!(linked instanceof HelloRefusedError), linked instanceof HelloRefusedError ? linked.message : "");
  assert.equal(linked.you?.id, roster.you.value?.id);
  const held = await linked.host.get(Roster, {}, context);
  stopAfter(t, () => held.release());
  assert.deepEqual(
    held.members.value.map((member) => member.name),
    roster.members.value.map((member) => member.name),
  );
  assert.ok(held.ways.value.some((way) => way.label === LABEL), "and sees your devices, as only you do");
});

test("the door refuses a link or a code from another page, a link from no page, and a link with no cookie", { timeout }, async (t) => {
  const { page, roster } = await withPage(t);
  const cookie = await letIn(page, roster);
  // A browser sends a host's cookies to every port of it, so a page on another port has the cookie too.
  const elsewhere = "http://127.0.0.1:1";

  await assert.rejects(linkFromPage(t, page, asBrowser(elsewhere, cookie)), "another page is turned away before it says anything");
  await assert.rejects(linkFromPage(t, page, asBrowser(undefined, cookie)), "and so is a link that says it comes from no page");
  const { code } = valueOf(await roster.inviteDevice(context));
  assert.equal((await showCode(page, code, elsewhere)).status, 403, "a code from another page is refused");
  assert.equal((await showCode(page, code)).status, 200, "and stays good for the door's own page");

  const anonymous = await linkFromPage(t, page, asBrowser(originOf(page), undefined));
  assert.ok(anonymous instanceof HelloRefusedError, "a browser with no cookie is no one");
  assert.equal((await fetch(new URL(`${PAGE_LINK}/elsewhere`, page), { headers: { accept: "text/html" } })).status, 404, "and nothing under the link is the page");
});

test("the door tells any page the key to subscribe with, and takes where a browser is told things from its own page, for a browser of yours", { timeout }, async (t) => {
  const { page, roster } = await withPage(t);
  const cookie = await letIn(page, roster);
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  const keys = { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
  const subscription = { endpoint: "https://push.example.net/push/JzLQ3raZ", expirationTime: null, keys };

  const told = await askPage(page, PAGE_PUSH, "GET", { origin: "http://127.0.0.1:1" });

  assert.equal(told.status, 200);
  assert.match((JSON.parse(told.text) as { key: string }).key, /^B[A-Za-z0-9_-]{86}$/, "a P-256 key, uncompressed, in base64url");
  const post = (asking: PageAsking) => askPage(page, PAGE_PUSH, "POST", { body: subscription, ...asking });
  assert.equal((await post({ cookie, origin: "http://127.0.0.1:1" })).status, 403, "another page can't say where you are told things");
  assert.equal((await post({})).status, 403, "and neither can a browser that isn't yours");
  assert.equal((await post({ cookie, body: { ...subscription, keys: { ...keys, p256dh: "not a key" } } })).status, 400);
  assert.equal((await post({ cookie })).status, 204);
});

test("a browser taken back loses its link and can't link again", { timeout }, async (t) => {
  const { page, roster } = await withPage(t);
  const cookie = await letIn(page, roster);
  const linked = await linkFromPage(t, page, asBrowser(originOf(page), cookie));
  assert.ok(!(linked instanceof HelloRefusedError));
  await until(() => roster.ways.value.some((way) => way.kind === "device"), "you to see the browser's way in");
  const way = roster.ways.value.find((each) => each.kind === "device");
  assert.ok(way !== undefined);

  valueOf(await roster.takeBack({ way: way.id }, context));

  await linked.closed;
  const again = await linkFromPage(t, page, asBrowser(originOf(page), cookie));
  assert.equal(again instanceof HelloRefusedError ? again.reason : "linked", "unknown_token");
});

test("with a certificate, the door serves HTTPS, and the browser's cookie goes over HTTPS alone", { timeout }, async (t) => {
  const folder = tempDir(t, "folder");
  const key = newKey();
  writeFileSync(join(folder, "page.crt"), selfSignedCertificate(key));
  writeFileSync(join(folder, "page.key"), key.export({ type: "pkcs8", format: "pem" }));
  const settings = join(folder, "settings.json");
  writeFileSync(settings, JSON.stringify({ page: { listen: "127.0.0.1:0", certificate: "page.crt", key: "page.key" } }));
  const { page, roster } = await withPage(t, { settings });
  assert.equal(new URL(page).protocol, "https:");
  const { code } = valueOf(await roster.inviteDevice(context));

  const shown = await showCode(page, code);

  const [cookie = "", ...attributes] = shown.cookie?.split(";").map((part) => part.trim()) ?? [];
  assert.ok(attributes.includes("Secure"));
  // Node's own WebSocket checks the certificate, and nothing here trusts this one.
  const socket = (url: string): PageSocket => new NodeWebSocket(url, { origin: originOf(page), headers: { cookie }, rejectUnauthorized: false });
  const linked = await linkFromPage(t, page, socket);
  assert.equal(linked instanceof HelloRefusedError ? linked.message : linked.you?.id, roster.you.value?.id);
});

test("a page's door that can't open stays shut, and the gateway starts all the same and says why", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  const said = (): string => reported.mock.calls.map((call) => call.arguments.join(" ")).join("\n");
  const other = createServer();
  await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
  stopAfter(t, () => new Promise<void>((resolve) => other.close(() => resolve())));
  const taken = formatAddress({ host: "127.0.0.1", port: (other.address() as AddressInfo).port });

  // Settings that can't be used, plain HTTP away from loopback, and a port another program has.
  for (const [listen, why] of [["nowhere", "page.listen"], ["192.0.2.1:7448", "192.0.2.1:7448"], [taken, taken]] as const) {
    const settings = join(tempDir(t, "folder"), "settings.json");
    writeFileSync(settings, JSON.stringify({ name: "Zach", page: { listen } }));

    const gateway = await startGatewayInProcess(t, { page: PAGE, settings });

    assert.equal(gateway.page, undefined, listen);
    assert.ok(said().includes(why), `it says why, for ${listen}:\n${said()}`);
    const you = await connectTestClient(t, { path: gateway.socket });
    const roster = await you.host.get(Roster, {}, context);
    assert.equal(roster.you.value?.name, "Zach", "and the rest of the settings count as they did");
    roster.release();
    await gateway.close();
  }
});
