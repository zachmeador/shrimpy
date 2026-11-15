import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Session } from "../../contracts/agent/index.ts";
import { connectHome, readEndpoint, readMembership } from "../../contracts/agent/node.ts";
import { hello, readAnswer, Roster } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { dial } from "../../lib/link/node.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { until } from "../../lib/testing/index.ts";
import { type AgentRig, holdAgent, SCOUT, startAgentRig } from "../testing/index.ts";
import type { AgentConnection } from "../testing/index.ts";
import { valueOf } from "../../contracts/chat/testing/index.ts";

/*
 * What a caller may do at an agent depends on who the request is stamped as: on the home's own socket it is the
 * home's owner, and through the gateway it is whoever the gateway says, with whether it is an admin read from the
 * roster as it is now.
 */

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/** Read the session behind the DM's thread, steer it and wait for the answer, and stop it: what watching and controlling a session are. */
async function readSteerAndStop(connection: AgentConnection, rig: AgentRig): Promise<void> {
  assert.deepEqual((await connection.sessions()).map((session) => session.threadId), [rig.thread.id]);
  const session = await connection.attach(rig.thread.id);
  assert.ok(session.view.items.length > 0, "the session can be read");
  const { submission } = await session.steer("say hello without chat");
  assert.equal((await session.wait(submission)).status, "answered");
  await session.stop();
  session.release();
}

test("through the gateway another agent may watch and control the sessions only as an admin", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  const person = await rig.chat.gateway.connect();
  const rex = await rig.chat.agent("rex");
  const roster = await person.host.get(Roster, {}, context);

  // A command in rex's shell holds scout's session through the gateway as rex, who is not an admin: the session is
  // refused, shows nothing, and so is every call on it.
  const shell = await rig.chat.gateway.connect(rex.token);
  const asRex = await shell.host.get(Session, { agent: SCOUT, session: rig.thread.id }, context);
  const refusal = asRex.refusal.value;
  assert.ok(refusal !== null && refusal.words.includes("rex"), "the refusal names who asked");
  assert.deepEqual(asRex.window.value.items, []);
  assert.equal(asRex.status.value, null);
  for (const answer of [
    await asRex.steer({ text: "do something", request: "rex-1" }, context),
    await asRex.stop(context),
    await asRex.read({ before: 1, limit: 10 }, context),
  ]) {
    assert.equal(answer.kind, "refused");
  }
  const rexAgent = await holdAgent(shell.host, SCOUT, async () => undefined);
  await assert.rejects(rexAgent.sessions(), isRefusal);
  await assert.rejects(rexAgent.triggers(), isRefusal);
  await assert.rejects(rexAgent.models(), isRefusal);
  await assert.rejects(rexAgent.reload(), isRefusal);

  // Promoted, rex may at once, on the session it already holds: its steer reaches scout as rex, and is answered.
  valueOf(await roster.promote({ member: rex.you.id }, context));
  await until(() => asRex.refusal.value === null, "rex's refusal to lift once it is an admin");
  assert.ok(asRex.window.value.items.length > 0, "and the session shows what it says");
  const steered = valueOf(await asRex.steer({ text: "say hello as rex", request: "rex-2" }, context));
  assert.equal(valueOf(await asRex.wait({ submission: steered.submission }, context)).status, "answered");
  await readSteerAndStop(rexAgent, rig);

  // Demoted, it may not again, at once.
  valueOf(await roster.demote({ member: rex.you.id }, context));
  await until(() => asRex.refusal.value !== null, "rex's refusal to come back once it is no admin");

  // The agent itself, through the gateway with the token its home keeps, may do all of it to its own sessions, and is
  // no admin: the first agent a roster has is one, so scout is made an ordinary agent first.
  const membership = readMembership(rig.home);
  assert.ok(membership?.memberId !== undefined, "the agent keeps the ID it knows itself by");
  valueOf(await roster.demote({ member: membership.memberId }, context));
  const own = await rig.chat.gateway.connect(membership.token);
  await readSteerAndStop(await holdAgent(own.host, SCOUT, async () => undefined), rig);
  // And so may you.
  await readSteerAndStop(await holdAgent(person.host, SCOUT, async () => undefined), rig);
});

test("on the home's own socket everything works, as it does with the gateway gone", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  await rig.chat.gateway.outage();

  const connection = await rig.connect();

  await readSteerAndStop(connection, rig);
  assert.deepEqual(await connection.triggers(), []);
  assert.equal((await connection.reload()).triggers, 0);
});

test("a client on the home's own socket holds what the agent doesn't serve through the agent's own link, as the agent", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  const client = await connectHome(rig.home);
  t.after(() => client.close());

  // The roster is the gateway's, so the hold goes up the agent's link, where the gateway takes it for the agent.
  const roster = await client.host.get(Roster, {}, context);
  assert.equal(roster.you.value?.id, rig.partner.id);
  // And the agent's own objects it holds as the home's owner, who may do anything, whatever the roster says of the agent.
  const membership = readMembership(rig.home);
  assert.ok(membership?.memberId !== undefined);
  const person = await rig.chat.gateway.connect();
  const admin = await person.host.get(Roster, {}, context);
  valueOf(await admin.demote({ member: membership.memberId }, context));
  await readSteerAndStop(await holdAgent(client.host, client.name, async () => undefined), rig);
});

test("the home's own socket turns away a client of other Pi packages, and one that shows a token", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const endpoint = readEndpoint(rig.home);
  assert.ok(endpoint !== undefined);
  const greeting = { ...hello({ kind: "client", token: null }), pi: { "@earendil-works/pi-durable": "0.9.0" } };
  const other = await dial({ path: endpoint.socket }, greeting);
  other.linked.drop();
  const answer = readAnswer(other.answer);
  assert.equal(answer?.kind, "refused");
  assert.ok(answer.words.includes("0.9.0"), answer.words);

  const token = await dial({ path: endpoint.socket }, hello({ kind: "client", token: newToken() }));
  token.linked.drop();
  assert.equal(readAnswer(token.answer)?.kind, "refused");
});
