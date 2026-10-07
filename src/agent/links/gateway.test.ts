import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ByteTransportFactory } from "@earendil-works/pi-client";
import type { Membership } from "../../contracts/agent/index.ts";
import {
  type Address,
  connectGateway,
  entryTransports,
  formatAddress,
  Gateway,
  GATEWAY_SERVER_ID,
  GATEWAY_SOCKET_NAME,
  type Member,
} from "../../contracts/gateway/index.ts";
import { type Heartbeat, localTransports, newToken } from "../../contracts/gateway/node.ts";
import { gatewayThatDoes, startTestGateway, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { countedBackoff, offer, startStandIn, stopAfter, until, useRuntimeDir } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { joinGateway } from "./gateway.ts";

const timeout = 30_000;

interface AgentOptions {
  /** Where the gateway's entry is, for an agent apart from the gateway. The agent reaches the gateway there unless `transportFactory` says otherwise. */
  apart?: Address;
  heartbeat?: Heartbeat;
  backoff?: Backoff;
  transportFactory?: ByteTransportFactory;
}

/**
 * The gateway link of the agent called `name` whose home is `home`, with its
 * membership kept in memory: what it tells a person, how many times it has
 * tried to get in, and where it listens. It is stopped when the test ends.
 */
function agentAt(t: TestContext, home: string, name: string, membership?: Membership, options: AgentOptions = {}) {
  let kept = membership;
  const told: string[] = [];
  let attempts = 0;
  const reach = options.transportFactory ?? (options.apart === undefined ? localTransports() : entryTransports(options.apart)).gateway;
  const serverId = randomUUID();
  const link = joinGateway({
    name,
    ...(options.apart === undefined ? {} : { apart: options.apart }),
    ...(options.heartbeat === undefined ? {} : { heartbeat: options.heartbeat }),
    // An agent apart has no socket to tell, since the gateway can't dial one.
    listening: { serverId, ...(options.apart === undefined ? { socket: `/tmp/${name}-${serverId}.sock` } : {}) },
    membership: {
      read: () => kept,
      save(next) {
        kept = next;
      },
    },
    files: { name: `${home}/agent.json`, membership: `${home}/state/member.json` },
    onError: (error) => told.push(error.message),
    transportFactory(handlers) {
      attempts++;
      return reach(handlers);
    },
    backoff: options.backoff ?? backoff({ firstMs: 5, maxMs: 20 }),
  });
  stopAfter(t, () => link.stop());
  return {
    link,
    serverId,
    told,
    attempts: () => attempts,
    membership: () => kept,
    /** Change what the home keeps, as an edit of its member file does. */
    keep(next: Membership) {
      kept = next;
    },
    files: (file: string) => `${home}/${file}`,
  };
}

/** A real gateway that listens on loopback for agents apart from it, and where. */
async function gatewayWithEntry(t: TestContext): Promise<{ gateway: TestGateway; address: Address }> {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening;
  assert.ok(address);
  return { gateway, address };
}

/**
 * What an agent called `name` keeps once it has joined from apart with an
 * invitation the person asked for, the way `agent join` leaves a home: its
 * token, who the gateway says it is and the address it joined through.
 */
async function joinedFromApart(gateway: TestGateway, address: Address, name: string): Promise<Membership> {
  const person = await gateway.connect();
  const { code } = await person.invite(name);
  const connection = await connectGateway({ transportFactory: entryTransports(address).gateway });
  try {
    const token = newToken();
    const member = await connection.join(name, token, code);
    return { token, memberId: member.id, gateway: address };
  } finally {
    await connection.close();
  }
}

test("a turned-away agent is told why once, with the advice that fits and the paths of its home, keeps trying, and takes the place of the agent it copies once that one stops", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const observer = await gateway.connect();
  const original = agentAt(t, "/homes/scout", "scout");
  await original.link.untilUp(AbortSignal.timeout(10_000));

  // A copy of the home, started with the name unchanged: it signs in, and the gateway refuses it when it registers.
  const copy = agentAt(t, "/homes/scout-copy", "scout", original.membership());
  await until(() => copy.attempts() >= 5, "the copy to be turned away again and again");
  assert.equal(copy.told.length, 1, "and told once");
  assert.ok(copy.told[0]?.includes(copy.files("state/member.json")) && copy.told[0].includes(copy.files("agent.json")));
  assert.equal(copy.link.current(), undefined);
  assert.equal((await observer.ticket({ kind: "agent", name: "scout" })).serverId, original.serverId, "the first is still the one reached");

  // The advice depends on the case: a token the roster does not have, and then, once the home has lost it, a name another member has.
  const visitor = agentAt(t, "/homes/visitor", "scout", { token: newToken(), memberId: "mem_000000000000" });
  await until(() => visitor.told.length === 1, "the visitor to be turned away");
  assert.ok(visitor.told[0]?.includes(visitor.files("state/member.json")) && !visitor.told[0].includes(visitor.files("agent.json")));
  visitor.keep({ token: newToken() });
  await until(() => visitor.told.length === 2, "the visitor to be turned away for its name");
  assert.ok(visitor.told[1]?.includes(visitor.files("agent.json")) && !visitor.told[1].includes(visitor.files("state/member.json")));

  await original.link.stop();
  await copy.link.untilUp(AbortSignal.timeout(10_000));
  assert.equal(copy.told.length, 1, "the copy joined as the agent without telling again");
  assert.equal((await observer.ticket({ kind: "agent", name: "scout" })).serverId, copy.serverId);
});

test("an agent apart whose token the gateway does not know is told to join again with a new invitation, and which command does it, where one beside the gateway is told to start again", { timeout }, async (t) => {
  const { address } = await gatewayWithEntry(t);
  const unknown: Membership = { token: newToken(), memberId: "mem_000000000000", gateway: address };

  const apart = agentAt(t, "/homes/crab", "crab", unknown, { apart: address });
  await until(() => apart.told.length === 1, "the agent apart to be turned away");
  assert.ok(apart.told[0]?.includes(apart.files("state/member.json")));
  assert.ok(apart.told[0]?.includes("shrimpy agent join"), apart.told.join("\n"));

  const beside = agentAt(t, "/homes/rex", "rex", unknown);
  await until(() => beside.told.length === 1, "the agent beside the gateway to be turned away");
  assert.ok(!beside.told[0]?.includes("shrimpy agent join"), beside.told.join("\n"));
});

test("an agent apart whose gateway stops answering with its connection still open lets go of the connection, and is registered again once the gateway answers", { timeout }, async (t) => {
  const { gateway, address } = await gatewayWithEntry(t);
  const person = await gateway.connect();
  const crab = agentAt(t, "/homes/crab", "crab", await joinedFromApart(gateway, address, "crab"), {
    apart: address,
    heartbeat: { everyMs: 100, withinMs: 1000 },
  });
  await crab.link.untilUp(AbortSignal.timeout(10_000));
  const running = async (): Promise<boolean | undefined> => (await person.members()).find((member) => member.name === "crab")?.reachable;
  assert.equal(await running(), true);

  // A gateway that answers is not let go of, however many times it is asked.
  const first = crab.link.current();
  await delay(800);
  assert.equal(crab.link.current(), first, "the same connection after eight times the pause between questions");
  assert.equal(crab.told.length, 0, "and nothing was said");

  // A process that is stopped takes connections and answers none of them, and the connection it holds stays open.
  gateway.freeze();
  await until(() => crab.link.current() === undefined, "the agent to let go of the connection to a gateway that does not answer");
  gateway.thaw();
  await crab.link.untilUp(AbortSignal.timeout(10_000));
  assert.notEqual(crab.link.current(), first, "it is registered on a connection of its own");
  assert.equal(await running(), true);
});

test("an agent apart says once that it can't reach its gateway however often it tries, as it does when it starts without one, and once that it is back, and an agent beside the gateway says nothing", { timeout }, async (t) => {
  const { gateway, address } = await gatewayWithEntry(t);
  const where = formatAddress(address);
  const crabPauses = countedBackoff();
  const mayaPauses = countedBackoff();
  const crab = agentAt(t, "/homes/crab", "crab", await joinedFromApart(gateway, address, "crab"), { apart: address, backoff: crabPauses });
  const rex = agentAt(t, "/homes/rex", "rex");
  const maya = await joinedFromApart(gateway, address, "maya");
  await Promise.all([crab.link.untilUp(AbortSignal.timeout(10_000)), rex.link.untilUp(AbortSignal.timeout(10_000))]);
  assert.deepEqual([crab.told, rex.told], [[], []], "nothing is said while the gateway is there");

  // The gateway goes away, and crab keeps trying to find it. A second agent apart starts while it is gone.
  await gateway.outage();
  await until(() => crab.told.length > 0, "crab to say that it lost the gateway");
  await until(() => crabPauses.taken() >= 8, "crab to have tried again and again");
  const starting = agentAt(t, "/homes/maya", "maya", maya, { apart: address, backoff: mayaPauses });
  await until(() => mayaPauses.taken() >= 8, "an agent that starts without a gateway to have tried again and again");
  assert.equal(crab.told.length, 1, "and it said nothing more");
  assert.ok(crab.told[0]?.includes(where), crab.told.join("\n"));
  assert.deepEqual(starting.told, crab.told, "an agent that starts without its gateway says the same, once");

  // The gateway comes back, where it was, and each agent says so.
  await gateway.recover();
  await Promise.all([crab.link.untilUp(AbortSignal.timeout(10_000)), starting.link.untilUp(AbortSignal.timeout(10_000))]);
  for (const agent of [crab, starting]) {
    assert.equal(agent.told.length, 2, "once more, and no more");
    assert.ok(agent.told[1]?.includes(where) && agent.told[1] !== agent.told[0], agent.told.join("\n"));
  }
  await rex.link.untilUp(AbortSignal.timeout(10_000));
  assert.deepEqual(rex.told, [], "an agent beside the gateway said nothing of it");
});

test("an agent apart says once for each connection that its gateway runs another version of Shrimpy, with both versions, and carries on", { timeout }, async (t) => {
  useRuntimeDir(t);
  const member: Member = { id: "mem_000000000001", kind: "agent", name: "crab", admin: false };
  const answering = () =>
    startStandIn(t, GATEWAY_SOCKET_NAME, {
      serverId: GATEWAY_SERVER_ID,
      offer: () =>
        offer(
          Gateway,
          gatewayThatDoes({
            signIn: () => Promise.resolve(member),
            register: () => Promise.resolve(),
            version: () => Promise.resolve("9.9.9"),
          }),
        ),
    });
  const first = await answering();
  const crab = agentAt(t, "/homes/crab", "crab", { token: newToken(), memberId: member.id }, {
    apart: { host: "127.0.0.1", port: 7447 },
    // The stand-in is reached over a Unix socket, which is the one thing that differs from an agent apart.
    transportFactory: localTransports().gateway,
  });
  await crab.link.untilUp(AbortSignal.timeout(10_000));
  const ofVersions = (): string[] => crab.told.filter((line) => line.includes("9.9.9") && line.includes(SHRIMPY_VERSION));
  await until(() => ofVersions().length === 1, "the agent to say that its gateway runs another version");
  await delay(100);
  assert.equal(ofVersions().length, 1, "once, however long the connection lasts");

  // A new connection is told of again.
  await first.close();
  await until(() => crab.link.current() === undefined, "the agent to lose the gateway");
  await answering();
  await crab.link.untilUp(AbortSignal.timeout(10_000));
  await until(() => ofVersions().length === 2, "the agent to say it again for the new connection");
});
