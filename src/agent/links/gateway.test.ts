import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHost, defineFacet, type Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { AgentPresence, type Membership } from "../../contracts/agent/index.ts";
import { agent, type Entry, type Principal, type Revocation, revokedBy, Roster, valueOf } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { startTestGateway } from "../../contracts/gateway/testing/index.ts";
import { countedBackoff, stopAfter, until } from "../../lib/testing/index.ts";
import { linkToGateway } from "./gateway.ts";

/*
 * The agent's link to the gateway, against the real gateway: what it tells a person when it is turned away, in the
 * paths of its home, and that it keeps trying.
 */

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/**
 * An agent's host called `name` whose home is `home`, linked to the gateway as the agent is, with its membership kept
 * in memory: what it tells a person, and who the gateway says it is. It is stopped when the test ends.
 */
async function agentAt(t: TestContext, home: string, name: string, membership?: Membership, apart?: Entry) {
  let kept = membership;
  const told: string[] = [];
  const pauses = countedBackoff();
  let current: { id: string; host: Host<Principal, Revocation> } | undefined;
  const link = linkToGateway({
    async serve(memberId) {
      if (current?.id === memberId) return current.host;
      const host = createHost<Principal, Revocation>({ address: agent({ id: memberId }), principal: { kind: "home" }, revokedBy, onError: () => undefined });
      await host.load(
        [{ name: "@shrimpy/test-agent", facet: defineFacet<Principal>((serving) => serving.serve(AgentPresence, () => ({ variant: "present", members: {} }))) }],
        context,
      );
      const previous = current?.host;
      current = { id: memberId, host };
      await previous?.close(context);
      return host;
    },
    name,
    home,
    ...(apart === undefined ? {} : { apart }),
    membership: {
      read: () => kept,
      save(next) {
        kept = next;
      },
    },
    files: { name: `${home}/agent.json`, membership: `${home}/state/member.json` },
    onError: (error) => told.push(error.message),
    backoff: pauses,
  });
  const stop = async (): Promise<void> => {
    await link.close();
    await current?.host.close(context);
  };
  stopAfter(t, stop);
  return { link, told, stop, membership: () => kept, files: (file: string) => `${home}/${file}`, tries: () => pauses.taken() };
}

test("a copy of a running agent is told why once, and takes the agent's place once that one stops", { timeout }, async (t) => {
  await startTestGateway(t);
  const original = await agentAt(t, "/homes/scout", "scout");
  await until(() => original.link.you() !== undefined, "the agent to be let in");
  const kept = original.membership();
  assert.ok(kept?.memberId !== undefined && kept.memberId === original.link.you()?.id, "the home keeps who the gateway says it is");
  assert.ok(kept.rosterId !== undefined, "and the roster's ID");

  // A copy of the home, started with the name unchanged, shows the same token, and the gateway turns it away.
  const copy = await agentAt(t, "/homes/scout-copy", "scout", kept);
  await until(() => copy.told.length > 0, "the copy to be told why");
  const tried = copy.tries();
  await until(() => copy.tries() >= tried + 5, "the copy to try five times more");
  assert.equal(copy.told.length, 1, "and told once, however often it tries");
  assert.ok(copy.told[0]?.includes(copy.files("state/member.json")) && copy.told[0].includes(copy.files("agent.json")), String(copy.told[0]));
  assert.ok(!copy.told[0]?.includes("shrimpy join"), "nothing beside the gateway asks for an invitation");
  assert.equal(copy.link.you(), undefined);

  // Once the first stops, the copy is the same agent, and takes its place.
  await original.stop();
  await until(() => copy.link.you()?.id === kept.memberId, "the copy to take the agent's place");
});

test("an agent apart whose token the gateway doesn't know is told to join again with a new invitation", { timeout }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const entry = { ...address, fingerprint: gateway.listening.fingerprint };

  const apart = await agentAt(t, "/homes/crab", "crab", { token: newToken(), memberId: "mem_gone", gateway: entry }, entry);
  await until(() => apart.told.length > 0, "the agent apart to be told why");
  assert.ok(apart.told[0]?.includes("shrimpy join") && apart.told[0].includes(apart.files("state/member.json")), String(apart.told[0]));
  assert.equal(apart.link.you(), undefined);

  // Beside the gateway, its own socket is the check, so a token it doesn't know joins the roster.
  const beside = await agentAt(t, "/homes/rex", "rex");
  await until(() => beside.link.you() !== undefined, "the agent beside the gateway to join");
  assert.deepEqual(beside.told, []);
});

test("an agent beside the gateway whose token was taken back is refused as unknown, and deleting its membership gives it a new token on the same entry", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const scout = await agentAt(t, "/homes/scout", "scout");
  await until(() => scout.link.you() !== undefined, "scout to join");
  const kept = scout.membership();
  assert.ok(kept?.memberId !== undefined && kept.rosterId !== undefined);

  const person = await gateway.connect();
  const roster = await person.host.get(Roster, {}, context);
  const way = roster.ways.value.find((each) => each.member === kept.memberId);
  assert.ok(way !== undefined);
  valueOf(await roster.takeBack({ way: way.id }, context));

  // Because the home kept this roster's ID, reconnecting with the revoked token gets unknown_token, not name_taken.
  await until(() => scout.told.length > 0, "scout to be told its token is unknown");
  assert.ok(scout.told[0]?.includes(scout.files("state/member.json")), String(scout.told[0]));
  assert.ok(!scout.told[0]?.includes("shrimpy join"), "beside the gateway needs no invitation");
  assert.equal(roster.members.value.filter((member) => member.name === "scout").length, 1);

  // Deleting state/member.json beside the gateway lets scout mint a fresh token and reclaim the same member ID.
  await scout.stop();
  const reclaimed = await agentAt(t, "/homes/scout", "scout");
  await until(() => reclaimed.link.you() !== undefined, "scout to reclaim its entry with a fresh token");
  assert.equal(reclaimed.link.you()?.id, kept.memberId);
  assert.notEqual(reclaimed.membership()?.token, kept.token);
  assert.equal(roster.members.value.filter((member) => member.name === "scout").length, 1);
});
