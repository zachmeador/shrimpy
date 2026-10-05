import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { shrimpy, startAgentShell } from "./testing/index.ts";

const timeout = 60_000;

/** The person who runs the gateway, who is the one admin there is until an agent is promoted. */
const person = userInfo().username;

/** What `members` prints, one member to a line: its name, kind, whether it is an admin and whether it is reachable. */
const roster = async (): Promise<string[][]> =>
  (await shrimpy(["members"])).stdout
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(/ {2,}/));

const admins = async (): Promise<string[]> =>
  (await roster()).filter(([, , admin]) => admin === "yes").map(([name]) => name ?? "");

test("members lists the roster with who is an admin, a person promotes and demotes agents, an agent that is not an admin is refused, and the role outlives the gateway", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const scout = await startAgentShell(t, "scout");
  await startAgentShell(t, "rex");
  assert.deepEqual(await roster(), [
    [person, "person", "yes", "no"],
    ["scout", "agent", "no", "no"],
    ["rex", "agent", "no", "no"],
  ]);

  // An agent that is not an admin is refused, and the error says who to ask.
  const refused = await scout.run(["members", "promote", "rex"]);
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes(person), refused.stderr);
  assert.deepEqual(await admins(), [person], "and nothing changed");

  // The person promotes scout, which can then promote rex, whatever case the name is written in.
  assert.equal((await shrimpy(["members", "promote", "scout"])).code, 0);
  assert.equal((await scout.run(["members", "promote", "REX"])).code, 0);
  assert.deepEqual(await admins(), [person, "scout", "rex"]);

  // The gateway keeps it.
  await gateway.outage();
  await gateway.recover();
  assert.deepEqual(await admins(), [person, "scout", "rex"]);

  // The person demotes rex. A person can't be demoted, and a name nobody has is an error.
  assert.equal((await shrimpy(["members", "demote", "rex"])).code, 0);
  assert.equal((await shrimpy(["members", "demote", person])).code, 1);
  assert.equal((await shrimpy(["members", "promote", "nobody"])).code, 1);
  assert.deepEqual(await admins(), [person, "scout"]);
});
