import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { networkInterfaces, userInfo } from "node:os";
import { type TestContext, test } from "node:test";
import {
  type Announcement,
  connectGateway,
  type GatewayConnection,
  NEEDS_ADMIN,
  readLink,
  TURNED_AWAY,
  webSocketPath,
  whyTurnedAway,
  writeLink,
} from "../contracts/gateway/index.ts";
import { connectLocalGateway, entryTransports, newToken, waysDirectory } from "../contracts/gateway/node.ts";
import { isRefusal, reasonOf } from "../lib/refusal/index.ts";
import { eventually, stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import {
  agentAnnouncement,
  canConnect,
  connectApart,
  connectEcho,
  entryOf,
  handshakeStatus,
  invited,
  joinAndRegister,
  LOOPBACK,
  rawRequest,
  startBytesTarget,
  startEchoProgram,
  startGatewayInProcess,
} from "./testing/index.ts";

/*
 * What a connection from apart may do, over a real WebSocket connection to the gateway's network entry on loopback.
 */

const timeout = 30_000;

/** A gateway that listens for agents apart from it, and closes when the test ends. */
async function gatewayWithEntry(t: TestContext) {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { listen: LOOPBACK });
  stopAfter(t, () => gateway.close());
  return gateway;
}

/** A connection on the gateway's own socket, which is the person who runs the gateway until it signs in. */
async function onTheSocket(t: TestContext): Promise<GatewayConnection> {
  const connection = await connectLocalGateway();
  stopAfter(t, () => connection.close());
  return connection;
}

/** An agent's announcement as one apart from the gateway makes it: it has no socket. */
const apartAnnouncement = (): Announcement => ({ kind: "agent", serverId: randomUUID(), version: SHRIMPY_VERSION });

test("a connection over the entry that has signed in or joined nothing can do nothing, and the person who runs the gateway is not who it is", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);
  const [self] = await person.members();
  assert.ok(self);
  const stranger = await connectApart(t, gateway);

  const attempts: [string, () => Promise<unknown>][] = [
    ["list", () => stranger.list()],
    ["the roster", () => stranger.members()],
    ["the version", () => stranger.version()],
    ["a ticket", () => stranger.ticket({ kind: "chat", name: "chat" })],
    ["register", () => stranger.register(apartAnnouncement())],
    ["invite", () => stranger.invite("crab")],
    ["promote", () => stranger.promote(self.id)],
    ["demote", () => stranger.demote(self.id)],
    ["redeem", () => stranger.redeem("made-up")],
  ];
  for (const [what, attempt] of attempts) await assert.rejects(attempt, { code: "service_not_allowed" }, what);

  assert.deepEqual(await person.list(), [], "nothing was registered");
  assert.deepEqual((await person.members()).map((member) => member.name), [userInfo().username], "and nobody joined");
});

test("a connection over the entry that has signed in is that agent, and may do what an agent may on the gateway's machine, which is not what the person may", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);
  const chat = await onTheSocket(t);
  await chat.register({ ...agentAnnouncement("chat"), kind: "chat" });
  const crab = await invited(t, gateway, person, "crab");
  const rex = await invited(t, gateway, person, "rex");
  // The first agent a roster has is an admin, so crab is made an ordinary agent, as rex is.
  crab.member = await person.demote(crab.member.id);

  // As that agent, over a connection that signs in with its token.
  const returning = await connectApart(t, gateway);
  assert.deepEqual(await returning.signIn(crab.token, null), crab.member);
  assert.deepEqual((await returning.list()).map((program) => program.kind), ["chat"]);
  assert.deepEqual((await returning.members()).map((member) => member.name), [userInfo().username, "crab", "rex"]);
  assert.equal(await returning.version(), SHRIMPY_VERSION);

  // Who it is shows in what it is asked for: a ticket it gets says it is crab, and the person's own says the person.
  const forCrab = await returning.ticket({ kind: "chat", name: "chat" });
  const forPerson = await person.ticket({ kind: "chat", name: "chat" });
  assert.deepEqual(await chat.redeem(forCrab.value), crab.member);
  assert.equal((await chat.redeem(forPerson.value)).name, userInfo().username);

  // It is not an admin, so it can't invite or promote, and the refusal says why.
  const needsAdmin = (error: unknown): boolean => isRefusal(error) && reasonOf(error) === NEEDS_ADMIN;
  await assert.rejects(returning.invite("maya"), needsAdmin);
  await assert.rejects(returning.promote(rex.member.id), needsAdmin);
  await assert.rejects(returning.demote(rex.member.id), needsAdmin);

  // Once the person has promoted it, it may, on the connection it already has.
  await person.promote(crab.member.id);
  assert.equal((await returning.promote(rex.member.id)).admin, true);
  assert.equal((await returning.demote(rex.member.id)).admin, false);
  const { code, addresses } = await returning.invite("maya");
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.deepEqual(addresses, gateway.listening);
});

test("a way through to a program over the entry opens only with a ticket that is good for that program, which the gateway looks at and does not spend", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const { port } = entryOf(gateway);
  const person = await onTheSocket(t);
  const echo = await startEchoProgram(t, "echo-agent");
  const other = await startBytesTarget("other");
  stopAfter(t, () => other.close());
  await joinAndRegister(await onTheSocket(t), "echo", { ...agentAnnouncement("echo"), serverId: echo.serverId, socket: echo.socket });
  await joinAndRegister(await onTheSocket(t), "other", { ...agentAnnouncement("other"), socket: other.socket });
  const crab = await invited(t, gateway, person, "crab");
  const echoTicket = await crab.connection.ticket({ kind: "agent", name: "echo" });
  const otherTicket = await crab.connection.ticket({ kind: "agent", name: "other" });
  const echoing = { kind: "agent", name: "echo" } as const;

  const refused = [
    webSocketPath(echoing),
    webSocketPath(echoing, "made-up"),
    webSocketPath(echoing, otherTicket.value),
    webSocketPath({ kind: "agent", name: "nobody" }, echoTicket.value),
    webSocketPath({ kind: "agent", name: "nobody" }),
  ];
  for (const path of refused) assert.equal(await handshakeStatus(port, path), 403, path);
  assert.equal(await handshakeStatus(port, webSocketPath(echoing, echoTicket.value), { Origin: `http://127.0.0.1:${port}` }), 403, "a web page, whatever it carries");
  assert.equal(other.connections.length, 0, "nothing was connected to the program that had the other ticket");
  assert.equal(echo.connections(), 0);

  // Looking at a ticket does not spend it: it is still good the second time, and for a connection that is used.
  assert.equal(await handshakeStatus(port, webSocketPath(echoing, echoTicket.value)), 101);
  assert.equal(await handshakeStatus(port, webSocketPath(echoing, echoTicket.value)), 101);
  const client = await connectEcho(echo.serverId, entryTransports(entryOf(gateway)).program(echoing, echoTicket.value));
  stopAfter(t, () => client.close());
  assert.equal(await client.echo("through the entry"), "echo: through the entry");

  // The gateway's own way asks for no ticket, since a connection there can do nothing before it signs in. It serves no files.
  assert.equal(await handshakeStatus(port, webSocketPath("gateway")), 101);
  assert.equal(await handshakeStatus(port, webSocketPath("gateway"), { Origin: "http://127.0.0.1" }), 403);
  assert.equal((await rawRequest(port, "/")).status, 404);
});

test("an invitation is for a name nobody has, and its code makes a member once, for that name only", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);

  const invitation = await person.invite("crab");
  assert.deepEqual(invitation.addresses, gateway.listening);
  assert.ok(invitation.expires > Date.now() && invitation.expires <= Date.now() + 15 * 60_000);
  await assert.rejects(person.invite(userInfo().username.toUpperCase()), /is taken/, "a name another member has, whatever the case");

  const token = newToken();
  const joining = await connectApart(t, gateway);
  await assert.rejects(joining.join("crab", token), /takes the code of an invitation/);
  await assert.rejects(joining.join("rex", token, invitation.code), /no invitation like that for rex/);
  await assert.rejects(joining.join("crab", token, "AAAA-AAAA"), /no invitation like that/);
  // The code is read without regard to case or the hyphen.
  const member = await joining.join("crab", token, invitation.code.replace("-", "").toLowerCase());
  assert.deepEqual([member.kind, member.name], ["agent", "crab"]);
  assert.deepEqual(await joining.members(), await person.members(), "and it is a member, signed in");

  // The code is used up, so another token can't have a member with it, and the name is taken, so no one can be invited for it.
  await assert.rejects((await connectApart(t, gateway)).join("crab", newToken(), invitation.code), /used already/);
  await assert.rejects(person.invite("crab"), /is taken/);
  // A home that never heard the answer asks again with the same token and code, and is the same member.
  assert.deepEqual(await (await connectApart(t, gateway)).join("crab", token, invitation.code), member);
  assert.equal((await person.members()).filter((each) => each.name === "crab").length, 1);
  // Joining without a code stays what it is on the gateway's own socket.
  assert.equal((await (await onTheSocket(t)).join("scout", newToken())).name, "scout");
});

test("after five wrong codes on one connection every join on it is refused, and the code that was not given stays good", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);
  const { code } = await person.invite("maya");

  const guessing = await connectApart(t, gateway);
  for (let wrong = 0; wrong < 5; wrong++) {
    await assert.rejects(guessing.join("maya", newToken(), "AAAA-AAAA"), /no invitation like that/, `wrong code ${String(wrong + 1)}`);
  }
  await assert.rejects(guessing.join("maya", newToken(), code), /wrong codes/, "the right one is refused too");

  const fresh = await connectApart(t, gateway);
  assert.equal((await fresh.join("maya", newToken(), code)).name, "maya");
});

test("the entry listens on every address it is told to and says which port each got, and closing the gateway frees them", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { listen: [...LOOPBACK, ...LOOPBACK] });
  const [first, second] = gateway.listening;
  assert.ok(first && second);
  assert.ok(first.port > 0 && second.port > 0 && first.port !== second.port, "port 0 picked one for each");

  for (const address of gateway.listening) {
    const connection = await connectGateway({ transportFactory: entryTransports(address).gateway });
    stopAfter(t, () => connection.close());
    await assert.rejects(connection.list(), { code: "service_not_allowed" }, "the gateway answers there");
  }
  await gateway.close();
  for (const { port } of gateway.listening) assert.equal(await canConnect("127.0.0.1", port), false);
});

const hasIPv6Loopback = Object.values(networkInterfaces()).some((addresses) => addresses?.some((each) => each.address === "::1"));

test("an agent joins over an IPv6 address, from the link the invitation makes", { timeout, skip: hasIPv6Loopback ? false : "this machine has no IPv6 loopback" }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { listen: [{ host: "::1", port: 0 }] });
  stopAfter(t, () => gateway.close());
  const person = await onTheSocket(t);

  const { code, addresses } = await person.invite("crab");
  const [address] = addresses;
  assert.ok(address);
  const link = writeLink({ name: "crab", address, code });
  assert.match(link, /^shrimpy:\/\/crab@\[::1\]:\d+\//);

  const read = readLink(link);
  assert.ok(read.name !== null);
  const connection = await connectGateway({ transportFactory: entryTransports(read.address).gateway });
  stopAfter(t, () => connection.close());
  assert.equal((await connection.join(read.name, newToken(), read.code)).name, "crab");
});

test("with no address to listen on, nobody could use an invitation, so none is made", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  stopAfter(t, () => gateway.close());
  const person = await onTheSocket(t);

  assert.deepEqual(gateway.listening, []);
  await assert.rejects(person.invite("crab"), /listens on no address/);
});

test("an agent apart registers with no socket, is listed as running and has a way in and a ticket like any program, and a copy of its home is turned away while it runs", { timeout }, async (t) => {
  const gateway = await gatewayWithEntry(t);
  const person = await onTheSocket(t);
  const crab = await invited(t, gateway, person, "crab");
  const announced = apartAnnouncement();
  await crab.connection.register(announced);

  assert.deepEqual(
    (await person.list()).map((program) => [program.kind, program.name, program.memberId]),
    [["agent", "crab", crab.member.id]],
  );
  assert.equal((await person.members()).find((member) => member.id === crab.member.id)?.reachable, true);
  assert.equal((await person.ticket({ kind: "agent", name: "crab" })).serverId, announced.serverId);
  assert.equal(readdirSync(waysDirectory()).length, 1, "and the gateway listens at a way in to it, as it does for a program with a socket");

  // A registration says it has a socket only where the gateway can dial it: on the gateway's own machine.
  const scout = await onTheSocket(t);
  await scout.join("scout", newToken());
  await assert.rejects(scout.register(apartAnnouncement()), /socket must be an absolute path/);
  const rex = await invited(t, gateway, person, "rex");
  await assert.rejects(rex.connection.register(agentAnnouncement("rex")), /registers with no socket/);
  assert.deepEqual((await person.list()).map((program) => program.name), ["crab"]);

  // A copy of the home holds crab's token. It is let in to sign in, and turned away when it joins again or registers.
  const turnedAway = (error: unknown): boolean => whyTurnedAway(error) === TURNED_AWAY.agentRunning;
  await assert.rejects((await connectApart(t, gateway)).join("crab", crab.token, crab.code), turnedAway);
  const copy = await connectApart(t, gateway);
  assert.deepEqual(await copy.signIn(crab.token, null), crab.member);
  await assert.rejects(copy.register(apartAnnouncement()), turnedAway);
  assert.equal(
    (await person.list()).filter((program) => program.memberId === crab.member.id).length,
    1,
    "the agent that runs is still the only one",
  );

  // Its registration lasts as long as its connection.
  await crab.connection.close();
  await eventually(
    () => person.members(),
    (members) => members.find((member) => member.id === crab.member.id)?.reachable === false,
    { what: "the agent to stop being listed as running" },
  );
  assert.deepEqual((await person.list()).map((program) => program.name), []);
  await eventually(() => readdirSync(waysDirectory()), (ways) => ways.length === 0, { what: "its way in to go with it" });
});
