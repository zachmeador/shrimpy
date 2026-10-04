import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { type Announcement, connectGateway, type Registration } from "../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError, newToken } from "../contracts/gateway/node.ts";
import { eventually, useRuntimeDir } from "../lib/testing/index.ts";
import {
  agentAnnouncement as agent,
  joinAndRegister,
  startEchoProgram,
  startRegistrantChild,
  startGatewayInProcess,
} from "./testing/index.ts";

const timeout = 30_000;

const chatAnnouncement = (): Announcement => ({ ...agent("chat"), kind: "chat" });

test("a registration is listed to every client, with the name the roster has for the agent", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const program = await connectLocalGateway();
  const observer = await connectLocalGateway();
  try {
    assert.deepEqual(await observer.list(), []);

    const researcher = await joinAndRegister(program, "researcher");

    assert.deepEqual(await observer.list(), [researcher]);
    assert.deepEqual(await program.list(), [researcher]);
    const reachable = (await observer.members()).filter((member) => member.reachable);
    assert.deepEqual(reachable.map((member) => member.id), [researcher.memberId], "and the agent is reachable");
  } finally {
    await program.close();
    await observer.close();
    await gateway.close();
  }
});

test("an agent registers as the member it signed in as, and the chat server as itself", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const [agentConnection, chatConnection, stranger, member, observer] = await Promise.all(
    [1, 2, 3, 4, 5].map(() => connectLocalGateway()),
  );
  try {
    await assert.rejects(stranger!.register(agent("nobody")), /join or sign in first/);
    const scout = await agentConnection!.join("scout", newToken());
    await agentConnection!.register(agent("scout"));
    await assert.rejects(agentConnection!.join("another", newToken()), /registered already/);
    await chatConnection!.register(chatAnnouncement());
    await member!.join("signed-in", newToken());
    await assert.rejects(member!.register(chatAnnouncement()), /Only an agent is a member/);

    assert.deepEqual(
      (await observer!.list()).map((program) => [program.kind, program.name, program.memberId]),
      [
        ["agent", "scout", scout.id],
        ["chat", "chat", null],
      ],
    );
  } finally {
    for (const connection of [agentConnection, chatConnection, stranger, member, observer]) await connection?.close();
    await gateway.close();
  }
});

test("every version is listed as it was given, and none is refused", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const first = await connectLocalGateway();
  const second = await connectLocalGateway();
  try {
    const current = await joinAndRegister(first, "current", { ...agent("current"), version: "0.0.0" });
    const ahead = await joinAndRegister(second, "ahead", { ...agent("ahead"), version: "99.0.0-next.1" });

    assert.deepEqual(await first.list(), [current, ahead]);
  } finally {
    await first.close();
    await second.close();
    await gateway.close();
  }
});

test("a registration lasts as long as its connection: it is gone when its process is killed, and the others stay", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const observer = await connectLocalGateway();
  const stays = await connectLocalGateway();
  const child = await startRegistrantChild(t, "victim");
  try {
    const staying = await joinAndRegister(stays, "stays");
    const listed = await observer.list();
    assert.deepEqual(listed.map((program) => program.name), ["victim", "stays"]);
    assert.equal(listed[0]?.pid, child.pid);

    await child.kill("SIGKILL");

    await eventually(() => observer.list(), (list) => list.length === 1);
    assert.deepEqual(await observer.list(), [staying]);
    const roster = await observer.members();
    assert.deepEqual(
      roster.slice(1).map((member) => [member.name, member.reachable]),
      [
        ["victim", false],
        ["stays", true],
      ],
      "a member that is not running stays on the roster",
    );
  } finally {
    await stays.close();
    await observer.close();
    await gateway.close();
  }
});

test("a copied home is two live connections with one ID: both are listed, and the member is reachable until both are gone", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const [original, copy, observer] = await Promise.all([1, 2, 3].map(() => connectLocalGateway()));
  try {
    const token = newToken();
    const member = await original!.join("scout", token);
    await original!.register(agent("scout"));
    await copy!.signIn(token, "scout");
    await copy!.register(agent("scout"));

    assert.deepEqual((await observer!.list()).map((program) => program.memberId), [member.id, member.id]);
    assert.equal((await observer!.members()).filter((each) => each.id === member.id).length, 1);

    await original!.close();
    await eventually(() => observer!.list(), (list) => list.length === 1);
    assert.equal((await observer!.members()).find((each) => each.id === member.id)?.reachable, true);
    await copy!.close();
    await eventually(() => observer!.members(), (members) => members.find((each) => each.id === member.id)?.reachable === false);
  } finally {
    for (const connection of [original, copy, observer]) await connection?.close();
    await gateway.close();
  }
});

test("a registration that cannot be accepted is refused with the reason", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const program = await connectLocalGateway();
  const observer = await connectLocalGateway();
  try {
    await program.join("one", newToken());
    const one = agent("one");
    await assert.rejects(program.register({ ...one, kind: "robot" } as unknown as Announcement), {
      code: "service_invalid_value",
      message: 'Invalid registration: kind must be "agent" or "chat"',
    });
    await assert.rejects(program.register({ ...one, socket: "one.sock" }), {
      code: "service_invalid_value",
      message: "Invalid registration: socket must be an absolute path",
    });
    assert.deepEqual(await observer.list(), []);

    await program.register(one);
    assert.deepEqual(
      (await observer.list()).map((registered: Registration) => registered.name),
      ["one"],
    );
  } finally {
    await program.close();
    await observer.close();
    await gateway.close();
  }
});

test("connecting fails as no gateway running when nothing listens", { timeout }, async (t) => {
  useRuntimeDir(t);
  await assert.rejects(connectLocalGateway(), GatewayNotRunningError);
});

test("a gateway client refuses a server that is not the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const echo = await startEchoProgram(t, "echo-agent");
  try {
    await assert.rejects(
      connectGateway({ transportFactory: createUnixTransportFactory({ path: echo.socket }) }),
      /does not match/,
    );
    await eventually(() => echo.connections(), (count) => count === 0);
  } finally {
    await echo.close();
  }
});
