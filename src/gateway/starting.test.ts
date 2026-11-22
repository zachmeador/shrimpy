import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { WebSocket } from "ws";
import { Roster } from "../contracts/gateway/index.ts";
import { formatAddress } from "../lib/link/index.ts";
import { GatewayRunningError } from "./index.ts";
import { connectTestClient } from "../contracts/gateway/testing/index.ts";
import { startGatewayInProcess } from "./testing/index.ts";

const timeout = 30_000;

test("a second gateway is turned away and the first goes on; once the first closes, its links drop and another starts", { timeout }, async (t) => {
  const first = await startGatewayInProcess(t);
  const place = { path: first.socket };
  const client = await connectTestClient(t, place);

  await assert.rejects(startGatewayInProcess(t), (error) => error instanceof GatewayRunningError);
  const roster = await client.host.get(Roster, {}, BACKGROUND_CONTEXT);
  assert.equal(roster.state.value.kind, "live", "the first is undisturbed");

  await first.close();
  await client.closed;
  const again = await startGatewayInProcess(t);
  assert.ok(existsSync(again.socket));
  await connectTestClient(t, place);
});

test("a web page is turned away before it says anything, on the gateway's socket and at its entry, the gateway's own page too", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t, {
    listen: [{ host: "127.0.0.1", port: 0 }],
    page: [{ path: "/", type: "text/html; charset=utf-8", body: "" }],
  });
  const [address] = gateway.listening;
  assert.ok(address !== undefined && gateway.page !== undefined);
  for (const url of [`ws+unix:${gateway.socket}:/`, `wss://${formatAddress(address)}/`]) {
    const page = new WebSocket(url, { origin: new URL(gateway.page).origin, rejectUnauthorized: false });
    const status = await new Promise<number | undefined>((resolve) => {
      page.once("unexpected-response", (_request, response) => resolve(response.statusCode));
      page.once("open", () => resolve(undefined));
      page.once("error", () => undefined);
    });
    page.terminate();
    assert.equal(status, 403, url);
  }
});
