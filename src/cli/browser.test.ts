import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_JOIN, readAnswer, readPageCode } from "../contracts/gateway/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { shrimpy, useShrimpyDir } from "./testing/index.ts";

/*
 * A browser of yours, through the real commands: the command that starts the gateway bundles the web client's page and
 * hands it over, and `invite` prints the link that lets a browser in, with the code where no server sees it.
 */

const timeout = 60_000;

test("the gateway serves the web client's page, and invite prints the link whose code lets a browser in", { timeout }, async (t) => {
  useShrimpyDir(t);
  const gateway = await startTestGateway(t);
  const { page } = gateway.listening;
  assert.ok(page !== null, "the command has the gateway serve the page");

  const invited = await shrimpy(["invite"]);
  assert.equal(invited.code, 0, invited.stderr);
  const link = invited.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(page));
  assert.ok(link !== undefined, invited.stdout);
  const code = readPageCode(new URL(link).hash);
  assert.ok(code !== undefined, "the code is in the link's fragment");

  const document = await fetch(page);
  assert.equal(document.status, 200);
  const [, script] = /<script[^>]*\ssrc="([^"]+)"/.exec(await document.text()) ?? [];
  assert.ok(script !== undefined, "the page loads its script");
  const bundle = await fetch(new URL(script, page));
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get("content-type") ?? "", /javascript/);

  const joined = await fetch(new URL(PAGE_JOIN, page), {
    method: "POST",
    headers: { origin: new URL(page).origin, "content-type": "application/json" },
    body: JSON.stringify({ code, label: "a browser" }),
  });
  assert.equal(readAnswer(await joined.json())?.kind, "welcome");
});
