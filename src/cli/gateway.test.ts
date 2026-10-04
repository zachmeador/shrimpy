import assert from "node:assert/strict";
import { test } from "node:test";
import type { Registration } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { startStandInGateway } from "../contracts/gateway/testing/index.ts";
import { stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

const program = (kind: Registration["kind"], name: string, version: string, pid: number): Registration => ({
  kind,
  name,
  serverId: "00000000-0000-4000-8000-000000000000",
  socket: `/tmp/${name}.sock`,
  pid,
  version,
});

test("status marks a program whose version differs from the command's, and says so when the gateway's does", { timeout: 15_000 }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t, { version: "9.9.9" });
  for (const registration of [
    program("chat", "chat", SHRIMPY_VERSION, 4242),
    program("agent", "scout", "8.8.8", 51_000),
  ]) {
    const connection = await connectLocalGateway();
    stopAfter(t, () => connection.close());
    await connection.register(registration);
  }
  const cli = captureIo();

  const code = await runCli(["gateway", "status"], cli.io);

  assert.equal(code, 0);
  const lines = cli.out.filter((line) => line.includes("differs"));
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("scout") && lines[0].includes("8.8.8"), "the agent of another version is marked");
  assert.ok(cli.err.join("\n").includes("9.9.9"), "and so is the gateway of another version, on standard error");
});
