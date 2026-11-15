import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { WebSocket } from "ws";
import { Roster } from "../contracts/gateway/index.ts";
import { GatewayRunningError } from "./index.ts";
import { connectTestClient, startTestGateway } from "./testing/index.ts";

const timeout = 30_000;

test("a second gateway is turned away and the first goes on; once the first closes, its links drop and another starts", { timeout }, async (t) => {
  const first = await startTestGateway(t);
  const place = { path: first.socket };
  const client = await connectTestClient(t, place);

  await assert.rejects(startTestGateway(t), (error) => error instanceof GatewayRunningError);
  const roster = await client.host.get(Roster, {}, BACKGROUND_CONTEXT);
  assert.equal(roster.state.value.kind, "live", "the first is undisturbed");

  await first.close();
  await client.closed;
  const again = await startTestGateway(t);
  assert.ok(existsSync(again.socket));
  await connectTestClient(t, place);
});

test("a web page is turned away before it says anything", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const page = new WebSocket(`ws+unix:${gateway.socket}:/`, { origin: "https://example.com" });
  const status = await new Promise<number | undefined>((resolve) => {
    page.once("unexpected-response", (_request, response) => resolve(response.statusCode));
    page.once("open", () => resolve(undefined));
    page.once("error", () => undefined);
  });
  page.terminate();
  assert.equal(status, 403);
});
