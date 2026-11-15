import assert from "node:assert/strict";
import { networkInterfaces, userInfo } from "node:os";
import { test } from "node:test";
import { hello, type HelloAnswer, type Link, readAnswer, readLink } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { dial } from "../lib/link/node.ts";
import { useRuntimeDir } from "../lib/testing/index.ts";
import { commandLines, type OnTheRoster, onTheRoster, shrimpy, startAgentShell } from "./testing/index.ts";

const timeout = 60_000;

const hasIPv6Loopback = Object.values(networkInterfaces()).some((addresses) =>
  addresses?.some((each) => each.address === "::1"),
);

/** The person who runs the gateway, who is the one admin there is until an agent is promoted. */
const person = userInfo().username;

/** The admins on the roster, as the gateway has them. */
const adminsOn = async (roster: OnTheRoster): Promise<string[]> =>
  (await roster.members()).filter((member) => member.admin).map((member) => member.name);

/** What the gateway says when it refuses `asked`, in its own words. */
async function refusalOf(asked: () => Promise<unknown>): Promise<string> {
  try {
    await asked();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("The gateway did what it was asked, and was expected to refuse.");
}

/** Join the gateway `link` sends to with its code, as `shrimpy join` does, and say what it answered. */
async function joinWith({ name, address, code, fingerprint }: Link): Promise<HelloAnswer | undefined> {
  const said = hello({ kind: "join", name, token: newToken(), code, machine: "elsewhere" });
  const { answer, linked } = await dial({ ...address, fingerprint }, said);
  linked.drop();
  return readAnswer(answer);
}

test("the person promotes and demotes agents, and an agent that is no admin is refused", { timeout }, async (t) => {
  await startTestGateway(t);
  const roster = await onTheRoster(t);
  const scout = await startAgentShell(t, "scout");
  await startAgentShell(t, "rex");
  const listed = await shrimpy(["members"]);
  assert.equal(listed.code, 0, listed.stderr);
  assert.ok([person, "scout", "rex"].every((name) => listed.stdout.includes(name)), listed.stdout);
  assert.deepEqual(await adminsOn(roster), [person], "the person is the one admin there is");

  // An agent that is not an admin is refused, and the error says who to ask.
  const refused = await scout.run(["members", "promote", "rex"]);
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes(person), refused.stderr);
  assert.deepEqual(await adminsOn(roster), [person], "and nothing changed");

  // The person promotes scout, which can then promote rex, whatever case the name is written in.
  assert.equal((await shrimpy(["members", "promote", "scout"])).code, 0);
  assert.equal((await scout.run(["members", "promote", "REX"])).code, 0);
  assert.deepEqual(await adminsOn(roster), [person, "scout", "rex"]);

  // The person demotes rex. A person can't be demoted, and a name nobody has is an error.
  assert.equal((await shrimpy(["members", "demote", "rex"])).code, 0);
  assert.equal((await shrimpy(["members", "demote", person])).code, 1);
  assert.equal((await shrimpy(["members", "promote", "nobody"])).code, 1);
  assert.deepEqual(await adminsOn(roster), [person, "scout"]);
});

test("an agent's role outlives the gateway", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  await startAgentShell(t, "scout");
  assert.equal((await shrimpy(["members", "promote", "scout"])).code, 0);

  await gateway.outage();
  await gateway.recover();

  assert.deepEqual(await adminsOn(await onTheRoster(t)), [person, "scout"]);
});

test("invite prints a line for each address the gateway listens on, whose code lets the agent in", { timeout }, async (t) => {
  useRuntimeDir(t);
  // A name no agent can have is refused with no gateway running: no home could be made for it, so there is nothing to ask.
  assert.equal((await shrimpy(["invite", "Scout Bot"])).code, 2);

  // The second is an IPv6 address where this machine has one, whose brackets a shell would read if the line did not quote them.
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }, { host: hasIPv6Loopback ? "::1" : "127.0.0.1", port: 0 }] });
  const listen = gateway.listening.listen;

  const invited = await shrimpy(["invite", "crab"]);
  assert.equal(invited.code, 0, invited.stderr);
  const lines = commandLines(invited.stdout);
  assert.ok(lines.every((line) => line.startsWith("shrimpy join ")), invited.stdout);
  if (hasIPv6Loopback) assert.ok(lines.some((line) => line.includes("'shrimpy://crab@[::1]:")), "an IPv6 link is quoted");
  const links = lines.map((line) => readLink(line.slice("shrimpy join ".length).replace(/^'(.*)'$/, "$1")));
  assert.deepEqual(links.map((link) => link.address), listen, "one line for each address, in the order the gateway has them");
  assert.ok(links.every((link) => link.name === "crab" && link.code === links[0]?.code), "for crab, with one code");
  assert.ok(links.every((link) => link.fingerprint === gateway.listening.fingerprint), "and the fingerprint of the gateway's key");

  // The code is good where the line says to use it.
  const [link] = links;
  assert.ok(link);
  const joined = await joinWith(link);
  assert.equal(joined?.kind === "welcome" ? joined.you?.name : joined?.words, "crab");

  // What the gateway refuses is passed on as it says it: here a name that another member has.
  const onTheSocket: OnTheRoster = await onTheRoster(t);
  const says = await refusalOf(() => onTheSocket.invite("crab"));
  const taken = await shrimpy(["invite", "crab"]);
  assert.equal(taken.code, 1);
  assert.ok(taken.stderr.includes(says), taken.stderr);
});

test("invite with no name prints a line for each address, whose code lets a machine in as the person", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }, { host: hasIPv6Loopback ? "::1" : "127.0.0.1", port: 0 }] });
  const listen = gateway.listening.listen;

  const invited = await shrimpy(["invite"]);
  assert.equal(invited.code, 0, invited.stderr);
  assert.ok(invited.stdout.includes(person), "it says who the machine will be");
  const lines = commandLines(invited.stdout);
  assert.ok(lines.every((line) => line.startsWith("shrimpy join ")), invited.stdout);
  const links = lines.map((line) => readLink(line.slice("shrimpy join ".length).replace(/^'(.*)'$/, "$1")));
  assert.deepEqual(links.map((link) => link.address), listen, "one line for each address, in the order the gateway has them");
  assert.ok(links.every((link) => link.name === null && link.code === links[0]?.code), "for a machine and not an agent, with one code");

  // The code is good where the line says to use it, and the machine it lets in is the person.
  const [link] = links;
  assert.ok(link);
  const joined = await joinWith(link);
  assert.deepEqual(joined?.kind === "welcome" ? [joined.you?.kind, joined.you?.name] : joined?.words, ["person", person]);
});

test("invite with no name is refused to an agent, an admin too, and where the gateway listens nowhere", { timeout }, async (t) => {
  await startTestGateway(t);
  const scout = await startAgentShell(t, "scout");
  const onTheSocket = await onTheRoster(t);

  const says = await refusalOf(() => onTheSocket.inviteDevice());
  const nowhere = await shrimpy(["invite"]);
  assert.equal(nowhere.code, 1);
  assert.ok(nowhere.stderr.includes(says), nowhere.stderr);

  // An agent is refused before the address is looked at, and being an admin makes no difference.
  for (const admin of [false, true]) {
    if (admin) assert.equal((await shrimpy(["members", "promote", "scout"])).code, 0);
    const refused = await scout.run(["invite"]);
    assert.equal(refused.code, 1, refused.stderr);
    assert.ok(!refused.stderr.includes(says), "it is not for want of an address");
    assert.ok(refused.stderr.includes(person), "it says who may ask for one");
  }
});

test("invite is refused where the gateway listens nowhere, and to an agent that is no admin", { timeout }, async (t) => {
  await startTestGateway(t);
  const scout = await startAgentShell(t, "scout");
  const onTheSocket = await onTheRoster(t);

  const says = await refusalOf(() => onTheSocket.invite("crab"));
  const nowhere = await shrimpy(["invite", "crab"]);
  assert.equal(nowhere.code, 1);
  assert.ok(nowhere.stderr.includes(says), nowhere.stderr);

  const refused = await scout.run(["invite", "crab"]);
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes(person), refused.stderr);
});
