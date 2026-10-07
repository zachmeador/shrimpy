import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { type AddressInfo, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readMembership, saveMembership } from "../../contracts/agent/node.ts";
import { type Address, writeLink } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { initHome, loadHome } from "../home/index.ts";
import { JoinFailedError, joinHome } from "./join-home.ts";

/*
 * What joining a home with a link refuses before it sends anything. Joining itself, against a gateway that lets the
 * agent in, is tried with real programs in cli/apart.test.ts.
 */

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

test("a home whose agent is called something else than the link says is refused, and so is text that is not a link or a link that names no agent, before the home is touched", async (t) => {
  const home = homeOf(t, "crab");
  const address = await closedAddress();
  const { paths } = loadHome(home);

  await assert.rejects(joinHome(home, writeLink({ name: "rex", address, code: "K7Q2-9FXD" })), (error: Error) => {
    assert.ok(error.message.includes("rex") && error.message.includes("crab"), "it names both agents");
    assert.ok(error.message.includes(paths.config), "and the file to change");
    return true;
  });
  await assert.rejects(joinHome(home, "not a link"), /is not an invitation link/);
  await assert.rejects(joinHome(home, writeLink({ name: null, address, code: "K7Q2-9FXD" })));
  assert.equal(existsSync(paths.member), false, "no token was made for any of them");
});

test("a home that is a member somewhere already is refused, with the file to delete to join anew, and nothing in it changes", async (t) => {
  const address = await closedAddress();
  const link = writeLink({ name: "crab", address, code: "K7Q2-9FXD" });
  const kept = [
    { home: homeOf(t, "crab"), membership: { token: newToken(), memberId: "mem_aaaaaaaaaaaa" } },
    {
      home: homeOf(t, "crab"),
      membership: { token: newToken(), memberId: "mem_bbbbbbbbbbbb", gateway: { host: "100.101.102.103", port: 7447 } },
    },
  ];

  for (const { home, membership } of kept) {
    saveMembership(home, membership);
    await assert.rejects(joinHome(home, link), (error: Error) => {
      assert.ok(error.message.includes(loadHome(home).paths.member), "it names the file to delete");
      return true;
    });
    assert.deepEqual(readMembership(home), membership);
  }
});

test("a home keeps its token before it joins, and asks again with the same token when the gateway can't be reached", async (t) => {
  const home = homeOf(t, "crab");
  const address = await closedAddress();
  const link = writeLink({ name: "crab", address, code: "K7Q2-9FXD" });

  await assert.rejects(
    joinHome(home, link),
    (error: Error) =>
      error instanceof JoinFailedError &&
      error.message.includes(`Could not reach the gateway at 127.0.0.1:${String(address.port)}`),
  );
  const made = readMembership(home);
  assert.deepEqual(Object.keys(made ?? {}), ["token"], "it has a token, and is no member yet");

  await assert.rejects(joinHome(home, link), JoinFailedError);
  assert.equal(readMembership(home)?.token, made?.token);
});

test("a join that is given up on while the gateway says nothing fails as an attempt that can be made again, with the token kept", async (t) => {
  const home = homeOf(t, "crab");
  // A server that takes the connection and never answers.
  const taken = new Set<Socket>();
  const silent = createServer((socket) => taken.add(socket));
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  stopAfter(t, async () => {
    for (const socket of taken) socket.destroy();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  });
  const { port } = silent.address() as AddressInfo;
  const link = writeLink({ name: "crab", address: { host: "127.0.0.1", port }, code: "K7Q2-9FXD" });

  const giveUp = new AbortController();
  setTimeout(() => giveUp.abort(), 200);
  await assert.rejects(joinHome(home, link, { signal: giveUp.signal }), JoinFailedError);

  assert.deepEqual(Object.keys(readMembership(home) ?? {}), ["token"]);
});
