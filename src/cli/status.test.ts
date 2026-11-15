import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { initHome } from "../agent/index.ts";
import { saveMembership } from "../contracts/agent/node.ts";
import { formatAddress } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { useRuntimeDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo, startScriptedAgent, startTalking, untilLinked, useShrimpyDir } from "./testing/index.ts";

test("status names a program whose version differs from the command's", { timeout: 30_000 }, async (t) => {
  useShrimpyDir(t);
  await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: () => ({ status: "silent" }), version: "8.8.8" });
  await untilLinked("agent", "scout");
  const cli = captureIo();

  const code = await runCli(["status"], cli.io);

  assert.equal(code, 0);
  const lines = cli.out.filter((line) => line.includes("8.8.8"));
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("scout"), "the agent of another version is named with its version");
  assert.ok(cli.out.at(-1)?.includes("shrimpy install"), "and it ends with a line on the service, of which this home has none");
});

test("status with no gateway here says where the folder's agents' gateway is, and exits 1", { timeout: 15_000 }, async (t) => {
  useRuntimeDir(t);
  const agents = join(useShrimpyDir(t), "agents");
  const address = { host: "10.0.0.5", port: 7447 };
  initHome(join(agents, "crab"), { name: "crab" });
  saveMembership(join(agents, "crab"), { token: newToken(), gateway: { ...address, fingerprint: "ocKmkNBacmPG6VxrlnuW3Q" } });

  const elsewhere = captureIo();
  assert.equal(await runCli(["status"], elsewhere.io), 1);

  const said = elsewhere.err.join("\n");
  assert.ok(said.includes(formatAddress(address)), "it says where that gateway is");
  assert.ok(!said.includes("shrimpy up"), "and not to start one here, which shrimpy up would not");
  assert.ok(elsewhere.out.at(-1)?.includes("shrimpy install"), "it ends with the line on the service");

  // A folder with an agent of its own gets the answer it always did, since shrimpy up starts the gateway for it.
  initHome(join(agents, "scout"), { name: "scout" });
  const here = captureIo();
  assert.equal(await runCli(["status"], here.io), 1);
  assert.ok(here.err.join("\n").includes("shrimpy up"), "it says to start one");
  assert.ok(here.out.at(-1)?.includes("shrimpy install"), "and it ends with the line on the service too");
});
