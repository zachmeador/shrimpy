import assert from "node:assert/strict";
import { test } from "node:test";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME, type Registration } from "../contracts/gateway/index.ts";
import { gatewayThatDoes } from "../contracts/gateway/testing/index.ts";
import { offer, startStandIn, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

const program = (kind: Registration["kind"], name: string, version: string): Registration => ({
  kind,
  name,
  memberId: kind === "agent" ? `mem_${name}` : null,
  version,
});

test("status marks a program whose version differs from the command's, and says so when the gateway's does", { timeout: 15_000 }, async (t) => {
  useRuntimeDir(t);
  const programs = [program("chat", "chat", SHRIMPY_VERSION), program("agent", "scout", "8.8.8")];
  // A gateway that runs another version than this command cannot be had by starting the real one.
  await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer: () =>
      offer(
        Gateway,
        gatewayThatDoes({
          list: () => Promise.resolve(programs),
          members: () => Promise.resolve([{ id: "mem_scout", kind: "agent", name: "scout", admin: false, reachable: true }]),
          version: () => Promise.resolve("9.9.9"),
        }),
      ),
  });
  const cli = captureIo();

  const code = await runCli(["gateway", "status"], cli.io);

  assert.equal(code, 0);
  const lines = cli.out.filter((line) => line.includes("differs"));
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("scout") && lines[0].includes("8.8.8"), "the agent of another version is marked");
  assert.ok(cli.err.join("\n").includes("9.9.9"), "and so is the gateway of another version, on standard error");
  assert.ok(cli.out.some((line) => line.includes("mem_scout") && line.includes("yes")), "and the roster is listed");
  assert.ok(cli.out.at(-1)?.includes("shrimpy gateway install"), "and it ends with a line on the service, of which this home has none");
});
