import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readMembership } from "../contracts/agent/node.ts";
import { formatAddress, writeLink } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { stopAfter } from "../lib/testing/index.ts";
import { commandLines, serveGateway, shrimpy, useShrimpyDir } from "./testing/index.ts";

/*
 * `agent join`, as a command in a process of its own, against a gateway that listens on loopback. The pairing of two
 * folders, from the invitation to an agent that answers, is in pairing.test.ts.
 */

const timeout = 90_000;

/** A gateway that listens on loopback, and the person's connection to it, which makes the invitations. */
async function gatewayThatLetsIn(t: TestContext) {
  const gateway = await serveGateway(t, ["--listen", "127.0.0.1:0"]);
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  /** The link of an invitation for `name`, as `members invite` prints it. */
  const linkFor = async (name: string): Promise<string> => writeLink({ name, address, code: (await person.invite(name)).code });
  return { address, gateway, person, linkFor };
}

test("agent join makes the home with no model and joins with the link, keeps where the gateway is, and says what to do next, which is less once the folder has a model; the same link in that folder is refused", { timeout }, async (t) => {
  const { address, person, linkFor } = await gatewayThatLetsIn(t);
  const folder = useShrimpyDir(t);
  const link = await linkFor("crab");

  const joined = await shrimpy(["agent", "join", link]);

  assert.equal(joined.code, 0, joined.stderr);
  const home = join(folder, "agents", "crab");
  assert.deepEqual(JSON.parse(readFileSync(join(home, "agent.json"), "utf8")), { name: "crab" }, "a home that names no model");
  const crab = (await person.members()).find((member) => member.name === "crab");
  assert.equal(crab?.kind, "agent");
  assert.deepEqual(readMembership(home)?.gateway, address);
  assert.equal(readMembership(home)?.memberId, crab.id);
  assert.deepEqual(commandLines(joined.stdout), ["shrimpy providers login", "shrimpy up"], "the folder has no model, so signing in is first");

  // With a model in the folder, there is only starting left.
  mkdirSync(join(folder, "providers"));
  writeFileSync(join(folder, "providers", "default-model.json"), JSON.stringify({ provider: "local", id: "test-model" }));
  const second = await shrimpy(["agent", "join", await linkFor("rex")]);
  assert.equal(second.code, 0, second.stderr);
  assert.deepEqual(commandLines(second.stdout), ["shrimpy up"]);

  // Pasting the line again where it was used says what is there, and which file to delete to join anew. Nothing changes.
  const again = await shrimpy(["agent", "join", link]);
  assert.equal(again.code, 1);
  assert.ok(again.stderr.includes(join(home, "state", "member.json")), again.stderr);
  assert.equal(readMembership(home)?.memberId, crab.id);
});

test("agent join makes nothing for text that is not a link, a link for a machine of the person's own or a name no agent can have", { timeout }, async (t) => {
  const folder = useShrimpyDir(t);
  const address = { host: "127.0.0.1", port: 7447 };

  for (const wrong of [
    "not a link",
    "crab",
    writeLink({ name: "../elsewhere", address, code: "K7Q2-9FXD" }),
    writeLink({ name: "Scout Bot", address, code: "K7Q2-9FXD" }),
    writeLink({ name: null, address, code: "K7Q2-9FXD" }),
  ]) {
    assert.equal((await shrimpy(["agent", "join", wrong])).code, 2, wrong);
  }

  assert.equal(existsSync(folder), false, "and the Shrimpy folder is as it was");
});

test("agent join gives up on a gateway that does not answer, says where it tried, leaves the home it made, and the same link joins once the gateway answers", { timeout }, async (t) => {
  const { address, gateway, person, linkFor } = await gatewayThatLetsIn(t);
  const link = await linkFor("crab");
  const pid = gateway.listening.pid;
  // A process that is stopped takes connections and answers none of them. Killing it, as the test's end does, works all the same.
  process.kill(pid, "SIGSTOP");

  const silent = await shrimpy(["agent", "join", link]);

  assert.equal(silent.code, 1);
  assert.ok(silent.stderr.includes(formatAddress(address)), silent.stderr);
  const home = join(useShrimpyDir(t), "agents", "crab");
  assert.ok(existsSync(join(home, "agent.json")), "the home it made is still there");
  const waiting = readMembership(home);
  assert.deepEqual(Object.keys(waiting ?? {}), ["token"], "with the token the agent will join with");

  process.kill(pid, "SIGCONT");
  const joined = await shrimpy(["agent", "join", link]);
  assert.equal(joined.code, 0, joined.stderr);
  assert.equal(readMembership(home)?.token, waiting?.token, "it is the same agent");
  assert.equal((await person.members()).filter((member) => member.name === "crab").length, 1);
});
