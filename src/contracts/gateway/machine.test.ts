import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { isRefusal, isUnknownCall } from "../../lib/refusal/index.ts";
import { offer, startStandIn, stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { connectGateway, Gateway, GATEWAY_SERVER_ID, isToken, machineFile } from "./index.ts";
import { entryTransports, joinAsMachine, MachineJoinFailedError, newToken, readMachine, saveMachine } from "./node.ts";
import { gatewayThatDoes, startTestGateway } from "./testing/index.ts";

/*
 * A machine of a person's own joining a real gateway over its network entry on loopback, and what it keeps in its
 * Shrimpy folder.
 */

const timeout = 30_000;

/** Where a gateway that the test starts is told to listen: loopback, on a port of its own. */
const LISTEN = [{ host: "127.0.0.1", port: 0 }];

test("joining as a machine keeps one file in the Shrimpy folder, private to its owner, with the token, the gateway's address and who the person is, and the token signs in as the person", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t, { listen: LISTEN });
  const person = await gateway.connect();
  const [address] = gateway.listening;
  assert.ok(address);
  const { code } = await person.inviteMachine();
  const folder = join(tempDir(t, "machine"), "shrimpy");

  const joined = await joinAsMachine(folder, { name: null, address, code });

  assert.equal(joined.member.kind, "person");
  assert.equal(joined.gatewayVersion, SHRIMPY_VERSION);
  const kept = readMachine(folder);
  assert.ok(kept !== undefined && isToken(kept.token));
  assert.deepEqual(kept.gateway, address);
  assert.deepEqual(kept.member, { id: joined.member.id, name: joined.member.name });
  assert.equal(statSync(machineFile(folder)).mode & 0o777, 0o600, "only its owner can read the token");
  assert.deepEqual(readdirSync(folder), ["machine.json"], "and nothing is left of the write");

  // The token is what makes a connection the person.
  const returning = await connectGateway({ transportFactory: entryTransports(address).gateway });
  stopAfter(t, () => returning.close());
  assert.deepEqual(await returning.signIn(kept.token, null), joined.member);

  // A folder that has joined says which file to delete to join anew, and keeps what it has. A link that names an agent is no link for a machine.
  const next = { name: null, address, code: (await person.inviteMachine()).code };
  await assert.rejects(joinAsMachine(folder, next), (error: unknown) => error instanceof Error && error.message.includes(machineFile(folder)));
  assert.deepEqual(readMachine(folder), kept);
  await assert.rejects(
    joinAsMachine(join(tempDir(t, "other"), "shrimpy"), { ...next, name: "crab" }),
    (error: unknown) => error instanceof Error && error.message.includes("crab"),
  );
});

test("a join whose answer never came is made again with the same link and finds the same machine, and a token is never shown to a second gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t, { listen: LISTEN });
  const person = await gateway.connect();
  const [address] = gateway.listening;
  assert.ok(address);
  const link = { name: null, address, code: (await person.inviteMachine()).code };
  const folder = join(tempDir(t, "machine"), "shrimpy");

  // A gateway that takes the connection and answers nothing is given up on, and the folder keeps the token it will join with.
  gateway.freeze();
  await assert.rejects(joinAsMachine(folder, link, { signal: AbortSignal.timeout(1000) }), MachineJoinFailedError);
  const waiting = readMachine(folder);
  assert.ok(waiting !== undefined);
  assert.equal(waiting.member, undefined, "it has not joined, so it is nobody's machine yet");
  assert.deepEqual(waiting.gateway, address);

  gateway.thaw();
  const joined = await joinAsMachine(folder, link);
  assert.equal(readMachine(folder)?.token, waiting.token, "it is the same machine");
  assert.equal(readMachine(folder)?.member?.id, joined.member.id);

  // A folder that waited on another gateway starts over with a token of its own for this one.
  const elsewhere = join(tempDir(t, "elsewhere"), "shrimpy");
  saveMachine(elsewhere, { token: waiting.token, gateway: { host: "127.0.0.1", port: 9 } });
  await joinAsMachine(elsewhere, { name: null, address, code: (await person.inviteMachine()).code });
  assert.notEqual(readMachine(elsewhere)?.token, waiting.token);
  assert.deepEqual(readMachine(elsewhere)?.gateway, address);
});

test("a gateway that has no call for a machine, as one built before machines has none, is told apart from one that refuses", { timeout }, async (t) => {
  useRuntimeDir(t);
  const older: Partial<Gateway> = { ...gatewayThatDoes({}) };
  delete older.joinMachine;
  const standIn = await startStandIn(t, "older-gateway", {
    serverId: GATEWAY_SERVER_ID,
    offer: () => offer(Gateway, older as Gateway),
  });
  const connection = await connectGateway({ transportFactory: createUnixTransportFactory({ path: standIn.socket }) });
  stopAfter(t, () => connection.close());

  await assert.rejects(connection.joinMachine(newToken(), "K7Q2-9FXD"), (error: unknown) => isUnknownCall(error) && !isRefusal(error));
  await assert.rejects(connection.inviteMachine(), (error: unknown) => isRefusal(error) && !isUnknownCall(error));
});
