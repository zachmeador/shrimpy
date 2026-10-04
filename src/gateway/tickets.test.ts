import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import type { Announcement } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import { agentAnnouncement, startGatewayInProcess } from "./testing/index.ts";

const timeout = 30_000;

const chatRegistration = (): Announcement => ({ ...agentAnnouncement("chat"), kind: "chat" });
const chat = { kind: "chat", name: "chat" } as const;

test("a ticket says who asked, is good once and only for the program it was made for, and a made-up one is not good", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const connect = async () => {
    const connection = await connectLocalGateway();
    stopAfter(t, () => connection.close());
    return connection;
  };
  try {
    const [server, bystander, person, agent] = await Promise.all([connect(), connect(), connect(), connect()]);
    await server.register(chatRegistration());
    await bystander.join("scout");
    await bystander.register(agentAnnouncement("scout"));
    const joined = await agent.join("scout-too");

    const forPerson = await person.ticket(chat);
    const forAgent = await agent.ticket(chat);

    await assert.rejects(bystander.redeem(forPerson), /made for another program/);
    await assert.rejects(person.redeem(forPerson), /Only a registered program/, "nor can whoever asked for it");
    const who = await server.redeem(forPerson);
    assert.equal(who.kind, "person");
    assert.equal(who.name, userInfo().username);
    await assert.rejects(server.redeem(forPerson), /not good/, "a ticket answers once");
    await assert.rejects(server.redeem("made-up"), /not good/);
    assert.deepEqual(await server.redeem(forAgent), joined.member);
  } finally {
    await gateway.close();
  }
});

test("a ticket is made for a program that is registered, and only the chat server is one today", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const client = await connectLocalGateway();
  stopAfter(t, () => client.close());
  try {
    await assert.rejects(client.ticket(chat), /not registered/);
    await assert.rejects(client.ticket({ kind: "agent", name: "scout" }), /chat server only/);
  } finally {
    await gateway.close();
  }
});
