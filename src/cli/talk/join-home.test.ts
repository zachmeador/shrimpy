import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { type AddressInfo, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { initHome, loadHome, readMembership, saveMembership } from "../../contracts/agent/node.ts";
import { type Address, writeLink } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { joinHome } from "./join-home.ts";
import { JoinFailedError } from "./join.ts";

/*
 * What joining a home with a link refuses before it sends anything. Joining itself, against a gateway that lets the
 * agent in, is tried with real programs in cli/apart.test.ts.
 */

/** The fingerprint of a gateway's key, as an invitation's link carries it. */
const fingerprint = "ocKmkNBacmPG6VxrlnuW3Q";

/** An address on loopback that nothing listens on. */
async function closedAddress(): Promise<Address> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return { host: "127.0.0.1", port };
}

function homeOf(t: TestContext, name: string): string {
  const home = join(tempDir(t, "join-home"), name);
  initHome(home, { name });
  return home;
}

test("a link for another agent's name, or no link at all, is refused before the home is touched", async (t) => {
  const home = homeOf(t, "crab");
  const address = await closedAddress();
  const { paths } = loadHome(home);

  await assert.rejects(joinHome(home, writeLink({ name: "rex", address, code: "K7Q2-9FXD", fingerprint })), (error: Error) => {
    assert.ok(error.message.includes("rex") && error.message.includes("crab"), "it names both agents");
    assert.ok(error.message.includes(paths.config), "and the file to change");
    return true;
  });
  await assert.rejects(joinHome(home, "not a link"), /is not an invitation link/);
  await assert.rejects(joinHome(home, writeLink({ name: null, address, code: "K7Q2-9FXD", fingerprint })));
  assert.equal(existsSync(paths.member), false, "no token was made for any of them");
});

test("a home that is a member already keeps its membership while trying a new link, and restores it if refused", async (t) => {
  const address = await closedAddress();
  const secondAddress = await closedAddress();
  const link = writeLink({ name: "crab", address, code: "K7Q2-9FXD", fingerprint });
  const existing = {
    token: newToken(),
    memberId: "mem_bbbbbbbbbbbb",
    rosterId: "ros_111111111111",
    gateway: { host: "100.101.102.103", port: 7447, fingerprint },
  };
  const home = homeOf(t, "crab");
  saveMembership(home, existing);

  // Unreachable gateway: existing membership stays intact, and a new pending token is recorded under `joining`.
  await assert.rejects(joinHome(home, link), JoinFailedError);
  const first = readMembership(home);
  assert.ok(first !== undefined);
  assert.equal(first.token, existing.token);
  assert.equal(first.memberId, existing.memberId);
  assert.equal(first.rosterId, existing.rosterId);
  assert.deepEqual(first.gateway, existing.gateway);
  assert.ok(first.joining !== undefined && first.joining.token !== existing.token);
  assert.deepEqual(first.joining.gateway, { ...address, fingerprint });

  // Retrying to the same gateway reuses the pending token.
  await assert.rejects(joinHome(home, link), JoinFailedError);
  assert.equal(readMembership(home)?.joining?.token, first.joining.token);

  // Switching to a different gateway address mints a fresh pending token.
  const otherLink = writeLink({ name: "crab", address: secondAddress, code: "K7Q2-9FXD", fingerprint });
  await assert.rejects(joinHome(home, otherLink), JoinFailedError);
  const switched = readMembership(home);
  assert.ok(switched !== undefined);
  assert.equal(switched.token, existing.token);
  assert.ok(switched.joining !== undefined && switched.joining.token !== first.joining.token);
});

test("a home keeps its token before it joins, and asks again with the same token when the gateway can't be reached", async (t) => {
  const home = homeOf(t, "crab");
  const address = await closedAddress();
  const link = writeLink({ name: "crab", address, code: "K7Q2-9FXD", fingerprint });

  await assert.rejects(
    joinHome(home, link),
    (error: Error) => error instanceof JoinFailedError && error.message.includes(`127.0.0.1:${String(address.port)}`),
  );
  const made = readMembership(home);
  assert.ok(made?.token !== undefined);
  assert.equal(made.memberId, undefined, "it has a token, and is no member yet");
  assert.equal(made.joining?.token, made.token);

  await assert.rejects(joinHome(home, link), JoinFailedError);
  assert.equal(readMembership(home)?.token, made.token);
});

test("a join given up on while the gateway says nothing can be made again, with the token kept", async (t) => {
  const home = homeOf(t, "crab");
  const giveUp = new AbortController();
  // A server that takes the connection and never answers, and the join is given up on once it has.
  const taken = new Set<Socket>();
  const silent = createServer((socket) => {
    taken.add(socket);
    giveUp.abort();
  });
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  stopAfter(t, async () => {
    for (const socket of taken) socket.destroy();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  });
  const { port } = silent.address() as AddressInfo;
  const link = writeLink({ name: "crab", address: { host: "127.0.0.1", port }, code: "K7Q2-9FXD", fingerprint });

  await assert.rejects(joinHome(home, link, { signal: giveUp.signal }), JoinFailedError);

  const kept = readMembership(home);
  assert.ok(kept?.token !== undefined);
  assert.equal(kept.memberId, undefined);
  assert.equal(kept.joining?.token, kept.token);
});
