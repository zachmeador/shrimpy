import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AGENT_HOME_VARIABLE } from "../contracts/agent/index.ts";
import { memberNamed } from "../contracts/chat/testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { useRuntimeDir } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  serve,
  shrimpy,
  startAgentShell,
  startModelServer,
  untilRegistered,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * What a command does when it runs in the shell of one agent and is about another. Every `shrimpy` is its own
 * process, and so are the gateway and the agents.
 */

const timeout = 90_000;

/** The administrator there is when nobody has been promoted: the person who runs the gateway. */
const person = userInfo().username;

test("in an agent's shell, a sessions command about another agent is refused unless the agent is an admin, one about itself is not asked of the gateway, and without the gateway the other can't be reached", { timeout }, async (t) => {
  useRuntimeDir(t);
  const model = await startModelServer();
  t.after(() => model.close());
  const gateway = await startTestGateway(t);
  const served: Record<string, Awaited<ReturnType<typeof serve>>> = {};
  for (const name of ["scout", "rex"]) {
    assert.equal((await shrimpy(["agent", "init", name, "--model", "local/test-model"])).code, 0);
    const home = join(useShrimpyDir(t), "agents", name);
    declareLocalModel(home, { url: model.url, model: "test-model" });
    served[name] = await serve(t, home);
    await untilRegistered("agent", name);
  }
  const scout = served.scout?.listening.home ?? "";
  const inScoutsShell = { env: { [AGENT_HOME_VARIABLE]: scout } };
  const noSessions = "The agent has no sessions yet.";

  // About itself, which is what it is with no --agent, it goes by the home's path, as ever. About rex it goes through the gateway as scout, and rex refuses.
  const own = await shrimpy(["sessions", "list"], inScoutsShell);
  assert.equal(own.code, 0, own.stderr);
  const refused = await shrimpy(["sessions", "list", "--agent", "rex"], inScoutsShell);
  assert.equal(refused.code, 1, refused.stdout);
  assert.ok(refused.stderr.includes(person), `it says who to ask:\n${refused.stderr}`);
  assert.equal((await shrimpy(["agent", "status", "--agent", "rex"], inScoutsShell)).code, 1, "and so does asking whether it is running");
  assert.equal((await shrimpy(["sessions", "list", "--agent", "rex"])).stdout.trim(), noSessions, "while the person who runs the gateway is told");

  // Promoted at the gateway, scout may, with the next command.
  await (await gateway.connect()).promote((await memberNamed(t, "scout")).id);
  const admitted = await shrimpy(["sessions", "list", "--agent", "rex"], inScoutsShell);
  assert.equal(admitted.stdout.trim(), noSessions, admitted.stderr);
  const status = await shrimpy(["agent", "status", "--agent", "rex"], inScoutsShell);
  assert.equal((JSON.parse(status.stdout) as { pid: number }).pid, served.rex?.listening.pid);

  // With no gateway, the other agent can't be reached from an agent's shell, and the commands that go by the home's path still work.
  await gateway.outage();
  const down = await shrimpy(["sessions", "list", "--agent", "rex"], inScoutsShell);
  assert.equal(down.code, 1);
  assert.match(down.stderr, /without the gateway/);
  assert.equal((await shrimpy(["sessions", "list"], inScoutsShell)).stdout.trim(), noSessions, "its own agent does not need it");
  assert.equal((await shrimpy(["sessions", "list", "--agent", "scout"], inScoutsShell)).stdout.trim(), noSessions, "even when it is named");
  assert.equal((await shrimpy(["sessions", "list", "--agent", "rex"])).stdout.trim(), noSessions, "and neither does a person");
});

test("in an agent's shell, changing the triggers or the wake file of another agent asks the gateway whether the agent is an admin, and writes nothing if it is not", { timeout }, async (t) => {
  await startTestGateway(t);
  const scout = await startAgentShell(t, "scout");
  assert.equal((await shrimpy(["agent", "init", "rex", "--model", "local/test-model"])).code, 0);
  const rexHome = join(useShrimpyDir(t), "agents", "rex");
  const trigger = join(rexHome, "triggers", "nightly.md");
  const addToRex = ["triggers", "add", "nightly", "--every", "1h", "Tidy.", "--agent", "rex"];

  const refused = await scout.run(addToRex);
  const wakeRefused = await scout.run(["wake", "ops", "all", "--agent", "rex"]);

  assert.deepEqual([refused.code, wakeRefused.code], [1, 1]);
  assert.ok(refused.stderr.includes(person), `it says who to ask:\n${refused.stderr}`);
  assert.equal(existsSync(trigger) || existsSync(join(rexHome, "wake.json")), false, "nothing was written");

  // The agent's own triggers are its to change, and once the person has made it an admin so are another's.
  const own = await scout.run(["triggers", "add", "nightly", "--every", "1h", "Tidy."]);
  assert.equal(own.code, 0, own.stderr);
  assert.ok(existsSync(join(scout.home, "triggers", "nightly.md")));
  await (await (await startTestGateway(t)).connect()).promote(scout.member.id);
  const allowed = await scout.run(addToRex);
  assert.equal(allowed.code, 0, allowed.stderr);
  assert.ok(existsSync(trigger));
});
