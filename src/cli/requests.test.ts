import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { RequestPage, SessionRequest } from "../contracts/agent/index.ts";
import { agentHome, serve, shrimpy, startModelServer, startTalking, untilLinked } from "./testing/index.ts";

const timeout = 60_000;

test("sessions requests and sessions request inspect captured model requests in text and JSON", { timeout }, async (t) => {
  await startTalking(t);
  const model = await startModelServer(t);
  const home = await agentHome(t, model, "scout");
  mkdirSync(join(home, "context"), { recursive: true });
  writeFileSync(join(home, "context", "ops.md"), "Always keep notes crisp.\n");
  await serve(t, home);
  await untilLinked("agent", "scout");

  const run = await shrimpy(["run", "scout", "check status"]);
  assert.equal(run.code, 0, run.stderr);
  const thread = /\b(th_\w+)/.exec(run.stderr)?.[1];
  assert.ok(thread, `expected thread ID in stderr:\n${run.stderr}`);

  const listJson = await shrimpy(["sessions", "requests", thread, "--agent", "scout", "--json"]);
  assert.equal(listJson.code, 0, listJson.stderr);
  const page = JSON.parse(listJson.stdout) as RequestPage;
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]!.captured, true);
  assert.equal(page.items[0]!.outcome.kind, "ended");

  const listText = await shrimpy(["sessions", "requests", thread, "--agent", "scout"]);
  assert.equal(listText.code, 0, listText.stderr);
  assert.ok(listText.stdout.includes(page.items[0]!.id));
  assert.ok(listText.stdout.includes("captured"));

  const detailJson = await shrimpy(["sessions", "request", thread, "--agent", "scout", "--json"]);
  assert.equal(detailJson.code, 0, detailJson.stderr);
  const req = JSON.parse(detailJson.stdout) as SessionRequest;
  assert.equal(req.summary.id, page.items[0]!.id);
  assert.ok(req.sections.some((s) => s.key === "context" && s.sources.some((src) => src.path === "context/ops.md")));
  assert.ok(req.effectiveMessages.some((m) => m.role === "user" && m.blocks.some((b) => b.type === "text" && b.text.includes("check status"))));

  const detailText = await shrimpy(["sessions", "request", thread, req.summary.id, "--agent", "scout"]);
  assert.equal(detailText.code, 0, detailText.stderr);
  assert.ok(detailText.stdout.includes(`Request ${req.summary.id} (captured)`));
  assert.ok(detailText.stdout.includes("context/ops.md"));
  assert.ok(detailText.stdout.includes("Effective messages"));

  assert.ok(req.summary.assistantEntry !== null);
  const byEntry = await shrimpy(["sessions", "request", thread, "--entry", String(req.summary.assistantEntry), "--agent", "scout", "--json"]);
  assert.equal(byEntry.code, 0, byEntry.stderr);
  assert.equal((JSON.parse(byEntry.stdout) as SessionRequest).summary.id, req.summary.id);

  const missing = await shrimpy(["sessions", "request", thread, "999999:1", "--agent", "scout"]);
  assert.equal(missing.code, 1);
});
