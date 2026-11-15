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

test("status marks a program whose version differs from the command's, and lists the roster", { timeout: 30_000 }, async (t) => {
  useShrimpyDir(t);
  await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: () => ({ status: "silent" }), version: "8.8.8" });
  await untilLinked("agent", "scout");
  const cli = captureIo();

  const code = await runCli(["status"], cli.io);

  assert.equal(code, 0);
  const lines = cli.out.filter((line) => line.includes("differs"));
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("scout") && lines[0].includes("8.8.8"), "the agent of another version is marked");
  assert.ok(cli.out.some((line) => line.includes("scout") && line.includes("yes")), "and the roster is listed");
  assert.ok(cli.out.at(-1)?.includes("shrimpy install"), "and it ends with a line on the service, of which this home has none");
});

test("status, with no gateway on this machine, says where the gateway of the folder's agents is when they all belong to one elsewhere, and still exits 1", { timeout: 15_000 }, async (t) => {
  useRuntimeDir(t);
  const agents = join(useShrimpyDir(t), "agents");
  const address = { host: "10.0.0.5", port: 7447 };
  initHome(join(agents, "crab"), { name: "crab" });
  saveMembership(join(agents, "crab"), { token: newToken(), gateway: { ...address, fingerprint: "ocKmkNBacmPG6VxrlnuW3Q" } });

  const elsewhere = captureIo();
  assert.equal(await runCli(["status"], elsewhere.io), 1);

  const said = elsewhere.err.join("\n");
  assert.ok(said.includes(formatAddress(address)), "it says where that gateway is");
  assert.ok(!said.includes("Start Shrimpy with"), "and not to start one here, which shrimpy up would not");
  assert.ok(elsewhere.out.at(-1)?.includes("shrimpy install"), "it ends with the line on the service");

  // A folder with an agent of its own gets the answer it always did, since shrimpy up starts the gateway for it.
  initHome(join(agents, "scout"), { name: "scout" });
  const here = captureIo();
  assert.equal(await runCli(["status"], here.io), 1);
  assert.match(here.err.join("\n"), /No gateway is running on this machine\. Start Shrimpy with: shrimpy up/);
  assert.ok(here.out.at(-1)?.includes("shrimpy install"), "and it ends with the line on the service too");
});
