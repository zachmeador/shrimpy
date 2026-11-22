import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { PAGE_JOIN, pageLinkUrl, Roster, valueOf } from "../../contracts/gateway/index.ts";
import { askPage, startTestGateway } from "../../contracts/gateway/testing/index.ts";
import type { PageSocket } from "../../lib/link/index.ts";
import { countedBackoff, stopAfter, until } from "../../lib/testing/index.ts";
import { dialPage, keepGateway } from "./index.ts";

/*
 * A page's link to the real gateway, at its page's door, as a browser makes
 * it: the browser is let in by an invitation's code, keeps its token in a
 * cookie, and sends that cookie and its page's origin with the WebSocket.
 */

test("a page's dial keeps the page linked to the gateway across a loss, and says when the link is lost", { timeout: 60_000 }, async (t) => {
  const gateway = await startTestGateway(t);
  const page = gateway.listening.page;
  assert.ok(page !== null, "the gateway serves the page");
  const you = await gateway.connect();
  const roster = await you.host.get(Roster, {}, BACKGROUND_CONTEXT);
  stopAfter(t, () => roster.release());
  const { code } = valueOf(await roster.inviteDevice(BACKGROUND_CONTEXT));
  const joined = await askPage(page, PAGE_JOIN, "POST", { body: { code, label: "a browser in a test" } });
  const cookie = joined.setCookie?.split(";")[0];
  assert.ok(cookie !== undefined, "the browser is let in");

  const { origin } = new URL(page);
  const asBrowser = (url: string): PageSocket => new WebSocket(url, { headers: { origin, cookie } });
  const link = await keepGateway({ dial: dialPage(pageLinkUrl(new URL(page)), asBrowser), token: null, backoff: countedBackoff() });
  stopAfter(t, () => link.close());
  await until(() => link.status().state === "up", "the page to be linked");

  // The gateway that comes back opens its page's door where it was, as a person's does.
  writeFileSync(join(gateway.folder, "settings.json"), JSON.stringify({ page: { listen: `127.0.0.1:${new URL(page).port}` } }));
  await gateway.outage();
  await until(() => {
    const status = link.status();
    return status.state === "down" && status.why.kind === "lost";
  }, "the page to say its link is lost");
  await gateway.recover();
  await until(() => link.status().state === "up", "the page to be linked again", 20_000);
});
