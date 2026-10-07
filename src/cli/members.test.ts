import assert from "node:assert/strict";
import { networkInterfaces, userInfo } from "node:os";
import { test } from "node:test";
import {
  connectGateway,
  Gateway,
  GATEWAY_SERVER_ID,
  GATEWAY_SOCKET_NAME,
  type GatewayConnection,
  readLink,
} from "../contracts/gateway/index.ts";
import { connectLocalGateway, entryTransports, newToken } from "../contracts/gateway/node.ts";
import { gatewayThatDoes, startTestGateway } from "../contracts/gateway/testing/index.ts";
import { offer, startStandIn, stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo, commandLines, serveGateway, shrimpy, startAgentShell } from "./testing/index.ts";

const timeout = 60_000;

const hasIPv6Loopback = Object.values(networkInterfaces()).some((addresses) =>
  addresses?.some((each) => each.address === "::1"),
);

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

/** What the gateway says when it refuses to make an invitation for `name`, in its own words. */
async function refusalOf(connection: GatewayConnection, name: string): Promise<string> {
  try {
    await connection.invite(name);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`The gateway made an invitation for ${name}, and was expected to refuse.`);
}

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

test("members invite prints the line to run where the agent will live for each address the gateway listens on, says which is for another user, and the code in it lets the agent in", { timeout }, async (t) => {
  useRuntimeDir(t);
  // A name no agent can have is refused with no gateway running: no home could be made for it, so there is nothing to ask.
  assert.equal((await shrimpy(["members", "invite", "Scout Bot"])).code, 2);

  // The second is an IPv6 address where this machine has one, whose brackets a shell would read if the line did not quote them.
  const gateway = await serveGateway(t, ["--listen", "127.0.0.1:0", "--listen", hasIPv6Loopback ? "[::1]:0" : "127.0.0.1:0"]);
  const listen = gateway.listening.listen;

  const invited = await shrimpy(["members", "invite", "crab"]);
  assert.equal(invited.code, 0, invited.stderr);
  const lines = commandLines(invited.stdout);
  assert.ok(lines.every((line) => line.startsWith("shrimpy agent join ")), invited.stdout);
  if (hasIPv6Loopback) assert.ok(lines.some((line) => line.includes("'shrimpy://crab@[::1]:")), "an IPv6 link is quoted");
  const links = lines.map((line) => readLink(line.slice("shrimpy agent join ".length).replace(/^'(.*)'$/, "$1")));
  assert.deepEqual(links.map((link) => link.address), listen, "one line for each address, in the order the gateway has them");
  assert.ok(links.every((link) => link.name === "crab" && link.code === links[0]?.code), "for crab, with one code");
  assert.match(invited.stdout, /another user/, "and a loopback address is said to be for another user of this machine");

  // The code is good where the line says to use it.
  const [link] = links;
  assert.ok(link);
  const apart = await connectGateway({ transportFactory: entryTransports(link.address).gateway });
  stopAfter(t, () => apart.close());
  assert.equal((await apart.join("crab", newToken(), link.code)).name, "crab");

  // What the gateway refuses is passed on as it says it: here a name that another member has.
  const onTheSocket = await connectLocalGateway();
  stopAfter(t, () => onTheSocket.close());
  const says = await refusalOf(onTheSocket, "crab");
  const taken = await shrimpy(["members", "invite", "crab"]);
  assert.equal(taken.code, 1);
  assert.ok(taken.stderr.includes(says), taken.stderr);
});

test("members invite with no name prints the line to run on another machine of yours for each address the gateway listens on, says which are for the gateway's own machine, and the code in it lets a machine in as the person", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await serveGateway(t, ["--listen", "127.0.0.1:0", "--listen", hasIPv6Loopback ? "[::1]:0" : "127.0.0.1:0"]);
  const listen = gateway.listening.listen;

  const invited = await shrimpy(["members", "invite"]);
  assert.equal(invited.code, 0, invited.stderr);
  assert.ok(invited.stdout.includes(person), "it says who the machine will be");
  const lines = commandLines(invited.stdout);
  assert.ok(lines.every((line) => line.startsWith("shrimpy join ")), invited.stdout);
  const links = lines.map((line) => readLink(line.slice("shrimpy join ".length).replace(/^'(.*)'$/, "$1")));
  assert.deepEqual(links.map((link) => link.address), listen, "one line for each address, in the order the gateway has them");
  assert.ok(links.every((link) => link.name === null && link.code === links[0]?.code), "for a machine and not an agent, with one code");
  assert.match(invited.stdout, /loopback/, "and a loopback address is said to be one only the gateway's own machine reaches");

  // The code is good where the line says to use it, and the machine it lets in is the person.
  const [link] = links;
  assert.ok(link);
  const apart = await connectGateway({ transportFactory: entryTransports(link.address).gateway });
  stopAfter(t, () => apart.close());
  const member = await apart.joinMachine(newToken(), link.code);
  assert.deepEqual([member.kind, member.name], ["person", person]);
});

test("members invite with no name gives the line to run straight after what it says, with no label, when the gateway listens where another machine reaches it", { timeout: 15_000 }, async (t) => {
  useRuntimeDir(t);
  // Nothing is connected to the address: it is only what the gateway says it listens on.
  const address = { host: "100.101.102.103", port: 7447 };
  await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer: () =>
      offer(
        Gateway,
        gatewayThatDoes({
          inviteMachine: () =>
            Promise.resolve({
              code: "K7Q2-9FXD",
              addresses: [address],
              expires: Date.now() + 15 * 60_000,
              person: { id: "mem_aaaaaaaaaaaa", kind: "person", name: "zachmeador", admin: true },
            }),
        }),
      ),
  });
  const cli = captureIo();

  assert.equal(await runCli(["members", "invite"], cli.io), 0);

  assert.equal(cli.out.length, 2);
  assert.ok(cli.out[0]?.includes("zachmeador"), "it says who the machine will be");
  assert.equal(cli.out[1], "  shrimpy join shrimpy://100.101.102.103:7447/K7Q2-9FXD");
});

test("members invite with no name is refused to an agent, an admin too, in words that say why, and when the gateway listens nowhere is refused as the gateway says it", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const scout = await startAgentShell(t, "scout");
  const onTheSocket = await gateway.connect();

  const says = await onTheSocket.inviteMachine().then(
    () => undefined,
    (error: unknown) => (error as Error).message,
  );
  assert.ok(says !== undefined, "the gateway made an invitation, and was expected to refuse");
  const nowhere = await shrimpy(["members", "invite"]);
  assert.equal(nowhere.code, 1);
  assert.ok(nowhere.stderr.includes(says), nowhere.stderr);

  // An agent is refused before the address is looked at, and being an admin makes no difference.
  for (const admin of [false, true]) {
    if (admin) assert.equal((await shrimpy(["members", "promote", "scout"])).code, 0);
    const refused = await scout.run(["members", "invite"]);
    assert.equal(refused.code, 1, refused.stderr);
    assert.ok(!refused.stderr.includes(says), "it is not for want of an address");
    assert.ok(refused.stderr.includes("scout") && refused.stderr.includes(person), "it says who is refused and who to ask");
  }
});

test("members invite is refused as the gateway says it when the gateway listens nowhere, and to an agent that is no admin, who is told who the admins are", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const scout = await startAgentShell(t, "scout");
  const onTheSocket = await gateway.connect();

  const says = await refusalOf(onTheSocket, "crab");
  const nowhere = await shrimpy(["members", "invite", "crab"]);
  assert.equal(nowhere.code, 1);
  assert.ok(nowhere.stderr.includes(says), nowhere.stderr);

  const refused = await scout.run(["members", "invite", "crab"]);
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes(person), refused.stderr);
});
