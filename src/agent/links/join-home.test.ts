import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readMembership, saveMembership } from "../../contracts/agent/node.ts";
import { type Address, writeLink } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { initHome, loadHome } from "../home/index.ts";
import { joinHome } from "./join-home.ts";

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

test("a home whose agent is called something else than the link says is refused, and so is text that is not a link, before the home is touched", async (t) => {
  const home = homeOf(t, "crab");
  const address = await closedAddress();
  const { paths } = loadHome(home);

  await assert.rejects(joinHome(home, writeLink({ name: "rex", address, code: "K7Q2-9FXD" })), (error: Error) => {
    assert.ok(error.message.includes("rex") && error.message.includes("crab"), "it names both agents");
    assert.ok(error.message.includes(paths.config), "and the file to change");
    return true;
  });
  await assert.rejects(joinHome(home, "not a link"), /is not an invitation link/);
  assert.equal(existsSync(paths.member), false, "no token was made for either");
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

  await assert.rejects(joinHome(home, link), new RegExp(`Could not reach the gateway at 127\\.0\\.0\\.1:${String(address.port)}`));
  const made = readMembership(home);
  assert.deepEqual(Object.keys(made ?? {}), ["token"], "it has a token, and is no member yet");

  await assert.rejects(joinHome(home, link), /Could not reach the gateway/);
  assert.equal(readMembership(home)?.token, made?.token);
});
