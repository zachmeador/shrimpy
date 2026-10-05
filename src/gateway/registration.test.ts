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

test("a copy of an agent's home that joins or renames with its token is turned away while the agent runs, which keeps its name and stays the one reached", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const [original, copy, shell, observer] = await Promise.all([1, 2, 3, 4].map(() => connectLocalGateway()));
  try {
    const token = newToken();
    const running = agent("scout");
    const scout = await original!.join("scout", token);
    await original!.register(running);

    // The copy of a home that never wrote down its member ID joins. The copy of one that did signs in, under its new name.
    await assert.rejects(copy!.join("scout", token), { code: "service_not_allowed", message: /already running/ });
    await assert.rejects(copy!.join("scout2", token), { code: "service_not_allowed", message: /already running/ });
    await assert.rejects(copy!.signIn(token, "scout2"), { code: "service_not_allowed", message: /already running/ });

    const agents = (await observer!.members()).filter((each) => each.kind === "agent");
    assert.deepEqual(agents, [{ ...scout, reachable: true }], "nothing is renamed, and the copy made no member of its own");
    assert.equal((await observer!.ticket({ kind: "agent", name: "scout" })).serverId, running.serverId);
    await assert.rejects(observer!.ticket({ kind: "agent", name: "scout2" }), /no agent called scout2/);

    assert.deepEqual(await shell!.signIn(token, null), scout, "a command in the agent's shell still signs in as the agent");
  } finally {
    for (const connection of [original, copy, shell, observer]) await connection?.close();
    await gateway.close();
  }
});

test("once the running agent's connection is gone, its token joins and registers again, under another name too", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const [original, successor, observer] = await Promise.all([1, 2, 3].map(() => connectLocalGateway()));
  try {
    const token = newToken();
    const scout = await original!.join("scout", token);
    await original!.register(agent("scout"));
    await assert.rejects(successor!.join("scout2", token), /already running/);

    await original!.close();
    await eventually(() => observer!.list(), (list) => list.length === 0, { what: "the registration to go" });

    assert.deepEqual(await successor!.join("scout2", token), { ...scout, name: "scout2" });
    const next = agent("scout2");
    await successor!.register(next);
    assert.deepEqual(await observer!.list(), [{ kind: "agent", name: "scout2", memberId: scout.id, version: next.version }]);
    assert.equal((await observer!.ticket({ kind: "agent", name: "scout2" })).serverId, next.serverId);
  } finally {
    for (const connection of [original, successor, observer]) await connection?.close();
    await gateway.close();
  }
});

test("a copy that keeps the original's name signs in without a rename and registers beside it: both are listed, and the member is reachable until both are gone", { timeout }, async (t) => {
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
    await assert.rejects(program.register({ ...one, serverId: "not-a-uuid" }), {
      message: "Invalid registration: serverId must be a lowercase UUID, version 4",
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
