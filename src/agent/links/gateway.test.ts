import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHost, defineFacet } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { AgentPresence, type Membership } from "../../contracts/agent/index.ts";
import { agent, type Entry, type Principal, type Revocation, revokedBy } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { startTestGateway } from "../../contracts/gateway/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, until } from "../../lib/testing/index.ts";
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
  const host = createHost<Principal, Revocation>({ address: agent({ name }), principal: { kind: "home" }, revokedBy, onError: () => undefined });
  await host.load(
    [{ name: "@shrimpy/test-agent", facet: defineFacet<Principal>((serving) => serving.serve(AgentPresence, () => ({ variant: "present", members: {} }))) }],
    context,
  );
  const link = linkToGateway({
    host,
    name,
    ...(apart === undefined ? {} : { apart }),
    membership: {
      read: () => kept,
      save(next) {
        kept = next;
      },
    },
    files: { name: `${home}/agent.json`, membership: `${home}/state/member.json` },
    onError: (error) => told.push(error.message),
    backoff: backoff({ firstMs: 5, maxMs: 20 }),
  });
  const stop = async (): Promise<void> => {
    await link.close();
    await host.close(context);
  };
  stopAfter(t, stop);
  return { link, told, stop, membership: () => kept, files: (file: string) => `${home}/${file}` };
}

test("a copy of a running agent is told why once, and takes the agent's place once that one stops", { timeout }, async (t) => {
  await startTestGateway(t);
  const original = await agentAt(t, "/homes/scout", "scout");
  await until(() => original.link.you() !== undefined, "the agent to be let in");
  const kept = original.membership();
  assert.ok(kept?.memberId !== undefined && kept.memberId === original.link.you()?.id, "the home keeps who the gateway says it is");

  // A copy of the home, started with the name unchanged, shows the same token, and the gateway turns it away.
  const copy = await agentAt(t, "/homes/scout-copy", "scout", kept);
  await until(() => copy.told.length > 0, "the copy to be told why");
  await new Promise((resolve) => setTimeout(resolve, 200));
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
  const [address] = gateway.listening;
  assert.ok(address);
  const entry = { ...address, fingerprint: gateway.fingerprint };

  const apart = await agentAt(t, "/homes/crab", "crab", { token: newToken(), memberId: "mem_gone", gateway: entry }, entry);
  await until(() => apart.told.length > 0, "the agent apart to be told why");
  assert.ok(apart.told[0]?.includes("shrimpy join") && apart.told[0].includes(apart.files("state/member.json")), String(apart.told[0]));
  assert.equal(apart.link.you(), undefined);

  // Beside the gateway, its own socket is the check, so a token it doesn't know joins the roster.
  const beside = await agentAt(t, "/homes/rex", "rex");
  await until(() => beside.link.you() !== undefined, "the agent beside the gateway to join");
  assert.deepEqual(beside.told, []);
});
