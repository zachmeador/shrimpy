import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { linkTestAgent, startTestGateway } from "../contracts/gateway/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo, useShrimpyDir } from "./testing/index.ts";

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, err: cli.err.join("\n") };
}

test("agent init refuses a name the gateway's roster holds, whatever the case, and makes nothing", { timeout: 30_000 }, async (t) => {
  const folder = useShrimpyDir(t);
  await startTestGateway(t);
  await linkTestAgent(t, "scout");

  const taken = await run("agent", "init", "SCOUT");
  const free = await run("agent", "init", "rex");

  assert.equal(taken.code, 1, taken.err);
  assert.equal(existsSync(join(folder, "agents", "SCOUT")), false);
  assert.equal(free.code, 0, free.err);
  assert.equal(free.err, "", "a name the roster doesn't hold is made with nothing to warn of");
});

test("agent init with no gateway running makes the agent, and says its name wasn't checked", async (t) => {
  const folder = useShrimpyDir(t);

  const made = await run("agent", "init", "scout");

  assert.equal(made.code, 0, made.err);
  assert.ok(existsSync(join(folder, "agents", "scout", "agent.json")));
  assert.notEqual(made.err, "");
});
