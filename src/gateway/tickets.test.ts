import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import type { Announcement } from "../contracts/gateway/index.ts";
import { connectLocalGateway, newToken } from "../contracts/gateway/node.ts";
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
    await bystander.join("scout", newToken());
    await bystander.register(agentAnnouncement("scout"));
    const joined = await agent.join("scout-too", newToken());

    const forPerson = await person.ticket(chat);
    const forAgent = await agent.ticket(chat);

    await assert.rejects(bystander.redeem(forPerson.value), /made for another program/);
    await assert.rejects(person.redeem(forPerson.value), /Only a registered program/, "nor can whoever asked for it");
    const who = await server.redeem(forPerson.value);
    assert.equal(who.kind, "person");
    assert.equal(who.name, userInfo().username);
    await assert.rejects(server.redeem(forPerson.value), /not good/, "a ticket answers once");
    await assert.rejects(server.redeem("made-up"), /not good/);
    assert.deepEqual(await server.redeem(forAgent.value), joined);
  } finally {
    await gateway.close();
  }
});

test("a ticket is made for a program that is registered, chat server or agent, and comes with the server ID that program answers as", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const client = await connectLocalGateway();
  const server = await connectLocalGateway();
  const scout = await connectLocalGateway();
  for (const connection of [client, server, scout]) stopAfter(t, () => connection.close());
  try {
    await assert.rejects(client.ticket(chat), /no chat server registered/);
    await assert.rejects(client.ticket({ kind: "agent", name: "scout" }), /no agent called scout registered/);

    const chatServer = chatRegistration();
    const scouting = agentAnnouncement("scout");
    await server.register(chatServer);
    await scout.join("scout", newToken());
    await scout.register(scouting);

    assert.equal((await client.ticket(chat)).serverId, chatServer.serverId);
    assert.equal((await client.ticket({ kind: "agent", name: "scout" })).serverId, scouting.serverId);
  } finally {
    await gateway.close();
  }
});
