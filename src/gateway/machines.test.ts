import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { type Announcement, type GatewayConnection, NEEDS_ADMIN } from "../contracts/gateway/index.ts";
import { connectLocalGateway, newToken } from "../contracts/gateway/node.ts";
import { isRefusal, reasonOf } from "../lib/refusal/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { startGateway } from "./index.ts";
import {
  agentAnnouncement,
  connectApart,
  invited,
  invitedMachine,
  LOOPBACK,
  startGatewayInProcess,
} from "./testing/index.ts";

/*
 * A person's machines, over real WebSocket connections to the gateway's network entry on loopback: how one is let in
 * and recognized, and what it may not do. What an agent apart may do is in apart.test.ts.
 */

const timeout = 30_000;

const rosterFile = (dataDir: string): string => join(dataDir, "state", "roster.json");

/** A gateway that listens for machines and agents apart from it, and closes when the test ends. */
async function gatewayWithEntry(t: TestContext, dataDir?: string) {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { listen: LOOPBACK, ...(dataDir === undefined ? {} : { dataDir }) });
  stopAfter(t, () => gateway.close());
  return gateway;
}

/** A connection on the gateway's own socket, which is the person who runs the gateway until it signs in. */
async function onTheSocket(t: TestContext): Promise<GatewayConnection> {
  const connection = await connectLocalGateway();
  stopAfter(t, () => connection.close());
  return connection;
}

/** A registration as an agent apart makes it: it has no socket. */
const apartAnnouncement = (): Announcement => ({ kind: "agent", serverId: randomUUID(), version: SHRIMPY_VERSION });

test("a machine of the person's own joins with an invitation, once, and is the person from then on, the same member as on the gateway's own socket, also after the gateway restarts", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");
  const gateway = await gatewayWithEntry(t, dataDir);
  const person = await onTheSocket(t);
  const [self] = await person.members();
  assert.ok(self);

  const invitation = await person.inviteMachine();
  assert.deepEqual(invitation.addresses, gateway.listening);
  assert.deepEqual(invitation.person, { id: self.id, kind: "person", name: self.name, admin: true }, "it says who the machine will be");
  assert.ok(invitation.expires > Date.now() && invitation.expires <= Date.now() + 15 * 60_000);

  // The code is read without regard to case or the hyphen, and makes the machine the person.
  const token = newToken();
  const machine = await connectApart(t, gateway);
  const member = await machine.joinMachine(token, invitation.code.replace("-", "").toLowerCase());
  assert.deepEqual(member, invitation.person);
  assert.deepEqual(await machine.members(), await person.members(), "and it may do what a signed-in connection may");

  // A machine that never heard the answer shows the same token and code again and is let in. The code is used up for any other.
  assert.deepEqual(await (await connectApart(t, gateway)).joinMachine(token, invitation.code), member);
  await assert.rejects((await connectApart(t, gateway)).joinMachine(newToken(), invitation.code), /used already/);

  // From then on a connection that shows the token is the person, and the chat server is told so as it is for the socket's.
  const chat = await onTheSocket(t);
  await chat.register({ ...agentAnnouncement("chat"), kind: "chat" });
  const returning = await connectApart(t, gateway);
  assert.deepEqual(await returning.signIn(token, null), member);
  assert.deepEqual(await returning.signIn(token, self.name), member, "also by the person's own name");
  const forMachine = await returning.ticket({ kind: "chat", name: "chat" });
  const forSocket = await person.ticket({ kind: "chat", name: "chat" });
  assert.deepEqual(await chat.redeem(forMachine.value), member);
  assert.deepEqual(await chat.redeem(forSocket.value), member);
  assert.equal((await person.members()).length, 1, "and there is still one person");

  // The roster keeps a hash of the token with the person, and never the token.
  const stored = readFileSync(rosterFile(dataDir), "utf8");
  assert.ok(!stored.includes(token));
  assert.match(stored, /"machines"/);
  assert.equal(statSync(rosterFile(dataDir)).mode & 0o777, 0o600);

  await gateway.close();
  const back = await startGateway({ dataDir });
  stopAfter(t, () => back.close());
  assert.deepEqual(await (await connectApart(t, back)).signIn(token, null), member, "the gateway keeps it");
});

test("no agent gets an invitation for a machine of the person's own, an admin agent or not, over the entry or on the gateway's own socket, and the person gets one from the socket and from a machine that is in", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);
  const [self] = await person.members();
  assert.ok(self);
  const crab = await invited(t, gateway, person, "crab");
  const beside = await onTheSocket(t);
  await beside.signIn(crab.token, null);

  const refusedToAgent = async (asking: GatewayConnection): Promise<void> => {
    await assert.rejects(asking.inviteMachine(), (error: unknown) => {
      assert.ok(isRefusal(error));
      assert.equal(error.code, "service_not_allowed");
      assert.notEqual(reasonOf(error), NEEDS_ADMIN, "being an admin would not help");
      assert.ok(error.message.includes("crab") && error.message.includes(self.name), "it says who is refused and who to ask");
      return true;
    });
  };
  await refusedToAgent(crab.connection);
  await refusedToAgent(beside);

  await person.promote(crab.member.id);
  await refusedToAgent(crab.connection);
  await refusedToAgent(beside);

  // The person asks on the socket, and from a machine of theirs that is in already, and each invitation lets a machine in as them.
  const machine = await invitedMachine(t, gateway, person);
  const second = await machine.connection.inviteMachine();
  assert.equal(second.person.id, machine.member.id);
  const another = await connectApart(t, gateway);
  assert.deepEqual(await another.joinMachine(newToken(), second.code), machine.member);

  // A token is one member's: an agent's can't be a machine's, even with a code that was handed out, and still signs in as the agent.
  const handedOut = (await person.inviteMachine()).code;
  await assert.rejects((await connectApart(t, gateway)).joinMachine(crab.token, handedOut), isRefusal);
  assert.deepEqual(await (await connectApart(t, gateway)).signIn(crab.token, null), { ...crab.member, admin: true });
});

test("a person's machine can neither register a program nor rename the person, and a connection that showed no good code or known token is nobody", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);
  const [self] = await person.members();
  assert.ok(self);
  const machine = await invitedMachine(t, gateway, person);

  // A machine is no program: nothing it announces is listed, as an agent or as the chat server.
  await assert.rejects(machine.connection.register(apartAnnouncement()), { code: "service_not_allowed" });
  await assert.rejects(machine.connection.register({ ...apartAnnouncement(), kind: "chat" }), { code: "service_not_allowed" });
  await assert.rejects(machine.connection.calls(), { code: "service_not_allowed" });
  assert.deepEqual(await person.list(), []);
  assert.equal((await person.members())[0]?.reachable, false, "so the person is not shown as running");

  // Nothing renames a person, and a machine does not join again as someone else.
  await assert.rejects(machine.connection.signIn(machine.token, "maya"), { code: "service_not_allowed" });
  assert.equal((await person.members())[0]?.name, self.name);
  await assert.rejects(machine.connection.join("maya", newToken(), (await person.invite("maya")).code), /already signed in as/);
  await assert.rejects(machine.connection.joinMachine(newToken(), (await person.inviteMachine()).code), /already signed in as/);

  // A connection that has shown neither is nobody, as before there were machines.
  const stranger = await connectApart(t, gateway);
  const agentCode = (await person.invite("rex")).code;
  const machineCode = (await person.inviteMachine()).code;
  await assert.rejects(stranger.joinMachine(newToken(), "AAAA-AAAA"), /no invitation like that/);
  await assert.rejects(stranger.joinMachine(newToken(), agentCode), /no invitation like that/, "an agent's code is not a machine's");
  await assert.rejects(stranger.join("rex", newToken(), machineCode), /no invitation like that for rex/, "nor a machine's an agent's");
  await assert.rejects(stranger.join("rex", machine.token, agentCode), isRefusal, "and a machine's token is no agent's");
  assert.equal((await person.members()).some((member) => member.name === "rex"), false);
  await assert.rejects(stranger.signIn(newToken(), null), /does not know that token/);
  for (const attempt of [
    () => stranger.list(),
    () => stranger.members(),
    () => stranger.version(),
    () => stranger.ticket({ kind: "chat", name: "chat" }),
    () => stranger.register(apartAnnouncement()),
    () => stranger.invite("maya"),
    () => stranger.inviteMachine(),
  ]) {
    await assert.rejects(attempt, { code: "service_not_allowed" });
  }

  // After five wrong codes every join on a connection is refused, a machine's as an agent's, and the code not given stays good.
  const guessing = await connectApart(t, gateway);
  for (let wrong = 0; wrong < 5; wrong++) {
    await assert.rejects(guessing.joinMachine(newToken(), "AAAA-AAAA"), /no invitation like that/, `wrong code ${String(wrong + 1)}`);
  }
  await assert.rejects(guessing.joinMachine(newToken(), machineCode), /wrong codes/, "the right one is refused too");
  assert.equal((await (await connectApart(t, gateway)).joinMachine(newToken(), machineCode)).id, self.id);
});
