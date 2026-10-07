import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import { type AgentConnection, connectAgent } from "../contracts/agent/index.ts";
import { attachLocal } from "../contracts/agent/node.ts";
import { reachProgram } from "../contracts/gateway/index.ts";
import { localTransports } from "../contracts/gateway/node.ts";
import { stopAfter } from "../lib/testing/index.ts";
import { startAgentRig } from "./testing/index.ts";

/*
 * An agent has two sockets: the one in its home, which the home's owner reaches
 * by the home's path and which asks for no ticket, and the one the gateway
 * pipes connections made by its name to, which asks for a ticket first.
 */

const timeout = 30_000;
const SCOUT = { kind: "agent", name: "scout" } as const;

test("a client reaches the chat server and an agent by name through the gateway, and the gateway's list tells no one where they listen", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  const gateway = await rig.chat.gateway.connect();

  const listed = await gateway.list();
  assert.deepEqual(listed.map((program) => `${program.kind} ${program.name}`).sort(), ["agent scout", "chat chat"]);
  for (const program of listed) {
    assert.deepEqual(Object.keys(program).sort(), ["kind", "memberId", "name", "version"], "no socket, no pid");
  }

  // The chat server, by its name: this is how the rig's person talks to the agent.
  assert.deepEqual((await (await rig.chat.person()).chat.channels()).map((channel) => channel.kind), ["dm"]);
  // The agent, by its name: as the person who runs the gateway, watching and controlling a session.
  const { connection, entered } = await reachProgram({
    gateway,
    transports: localTransports(),
    target: SCOUT,
    connect: connectAgent,
    enter: (opened, ticket) => opened.enter(ticket),
  });
  stopAfter(t, () => connection.close());
  assert.equal(entered.kind, "person");
  assert.equal(entered.name, userInfo().username);
  assert.deepEqual((await connection.sessions()).map((session) => session.threadId), [rig.thread.id]);
  const session = await connection.attach(rig.thread.id);
  const { submission } = await session.steer("say hello without chat");
  assert.equal((await session.wait(submission)).status, "answered");
  await session.stop();
});

test("a connection to an agent through the gateway is refused without a good ticket, a ticket works once, and the home's path needs none", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  const gateway = await rig.chat.gateway.connect();
  const ticket = await gateway.ticket(SCOUT);
  const open = async (): Promise<AgentConnection> => {
    const connection = await connectAgent({
      serverId: ticket.serverId,
      transportFactory: localTransports().program(SCOUT, ticket.value),
    });
    stopAfter(t, () => connection.close());
    return connection;
  };
  const comeIn = /Come in with a ticket from the gateway/;

  const stranger = await open();
  await assert.rejects(stranger.sessions(), comeIn);
  await assert.rejects(stranger.reload(), comeIn);
  await assert.rejects(stranger.enter("made-up"), /not good/);
  await assert.rejects(stranger.sessions(), comeIn, "a ticket that is no good lets no one in");

  assert.equal((await stranger.enter(ticket.value)).kind, "person");
  assert.equal((await stranger.sessions()).length, 1);
  await assert.rejects(stranger.enter(ticket.value), /entered already/);
  await assert.rejects((await open()).enter(ticket.value), /not good/, "and a ticket that was used is no good to the next");

  const byHome = await attachLocal(rig.home);
  stopAfter(t, () => byHome.close());
  assert.equal((await byHome.sessions()).length, 1);
  await assert.rejects(byHome.enter(ticket.value), /needs no ticket/);
});
