import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { initHome, readMembership } from "../contracts/agent/node.ts";
import { Roster, writeLink } from "../contracts/gateway/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { listen } from "../lib/link/node.ts";
import { stopAfter, tempDir, until } from "../lib/testing/index.ts";
import { fingerprintOf, newKey } from "../lib/tls/node.ts";
import { joinHome } from "./index.ts";
import { SCOUT, startAgentRig, startChatServer } from "./testing/index.ts";
import { valueOf } from "../contracts/chat/testing/index.ts";

/*
 * An agent apart from the gateway, with the real gateway and chat server in processes of their own, and the agent
 * linking to the gateway's entry on an address with its token, as one under another user or on another machine does.
 */

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("an agent apart joins with an invitation, and links in with its token and the gateway's key, again later", { timeout }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const chat = await startChatServer(t);
  const person = await gateway.connect();
  const roster = await person.host.get(Roster, {}, context);
  const { code, fingerprint } = valueOf(await roster.invite({ name: SCOUT }, context));
  const home = tempDir(t, "agent");
  initHome(home, { name: SCOUT });
  const joined = await joinHome(home, writeLink({ name: SCOUT, address, code, fingerprint }));
  const entry = readMembership(home)?.gateway;
  assert.deepEqual(entry, { ...address, fingerprint: gateway.listening.fingerprint }, "the home keeps where its gateway is, and its key");

  const rig = await startAgentRig(t, { home, chat, join: { apart: entry } });
  assert.equal((await rig.receiptOn(await rig.say("are you there"))).status, "answered");
  // The agent's link is its token's way in, which the roster lists for it, and it is reachable.
  await until(() => roster.members.value.some((member) => member.id === joined.member.id && member.reachable), "scout to be reachable");
  assert.ok(roster.ways.value.some((way) => way.member === joined.member.id && way.kind === "token"));

  // The gateway goes away, and something else takes its address with a key of its own. The agent says hello to it no
  // more than it would to a stranger, so no token reaches it, and says what key it found there.
  await gateway.outage();
  const other = newKey();
  const hellos: unknown[] = [];
  const impostor = await listen({ ...address, key: other }, (hello) => {
    hellos.push(hello);
    return { answer: null };
  });
  stopAfter(t, () => impostor.close());
  await until(
    () => rig.reports.some((report) => (report as Error).message.includes(fingerprintOf(other))),
    "the agent to say what key it found at its gateway's address",
  );
  assert.deepEqual(hellos, [], "and nothing was said to it");

  // The gateway comes back on the same data, so with the same key: the agent links in again by itself, as the same member.
  await impostor.close();
  await gateway.recover();
  const receipt = await rig.receiptOn(await rig.say("and now"), 15_000);
  assert.equal(receipt.status, "answered");
  assert.equal(receipt.memberId, joined.member.id);
  assert.equal((await rig.replies()).length, 2);
});
