import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { initHome, saveMembership } from "../contracts/agent/node.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { formatAddress } from "../lib/link/index.ts";
import { useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { runCli } from "./index.ts";
import { captureIo, startScriptedAgent, startTalking, untilLinked, useShrimpyDir } from "./testing/index.ts";

test("status marks a program newer than the gateway with the gateway's version", { timeout: 30_000 }, async (t) => {
  useShrimpyDir(t);
  await startTalking(t);
  const [major = "0", minor = "0"] = SHRIMPY_VERSION.split(".");
  const newer = `${major}.${Number(minor) + 1}.0`;
  await startScriptedAgent(t, { name: "scout", handle: () => ({ status: "silent" }), version: newer });
  await untilLinked("agent", "scout");
  const cli = captureIo();

  const code = await runCli(["status"], cli.io);

  assert.equal(code, 0);
  const lines = cli.out.filter((line) => line.includes(newer));
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("scout") && lines[0].includes(SHRIMPY_VERSION), "the newer agent is named with its version and the gateway's");
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
