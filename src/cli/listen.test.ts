import assert from "node:assert/strict";
import { type AddressInfo, createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { test, type TestContext } from "node:test";
import type { Address } from "../contracts/gateway/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { formatAddress } from "../lib/link/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { canConnect, freeAddresses, launchUp, onTheRoster, shrimpy, untilLinked } from "./testing/index.ts";

/*
 * Where the gateway listens for agents apart from it: the addresses `--listen` gives, which the gateway keeps, through
 * `gateway serve` and `up` as processes of their own. Everything here listens on loopback, on ports that the operating
 * system picks (a port of 0) and the gateway reports.
 */

const timeout = 90_000;

const hasIPv6Loopback = Object.values(networkInterfaces()).some((addresses) =>
  addresses?.some((each) => each.address === "::1"),
);

/** Where the gateway on this machine says it listens, which every invitation it makes carries. */
async function whereItListens(t: TestContext): Promise<Address[]> {
  return (await (await onTheRoster(t)).invite("probe")).addresses;
}

test("a gateway started again with no --listen listens where it did, until --listen replaces it", { timeout }, async (t) => {
  // Given more than once, with an IPv6 address in brackets where this machine has one.
  const loopback = { host: "127.0.0.1", port: 0 };
  const gateway = await startTestGateway(t, { listen: [loopback, hasIPv6Loopback ? { host: "::1", port: 0 } : loopback] });
  const [first, second] = gateway.listening.listen;
  assert.ok(first && second && first.port > 0 && second.port > 0 && first.port !== second.port, "each got a port of its own");
  assert.equal(gateway.listening.listenKept, null, "it was told where to listen, so it read nothing");
  assert.equal(await canConnect(first), true);
  assert.equal((await gateway.stop()).code, 0);
  assert.equal(await canConnect(first), false);

  // What is kept is where it listened, so a port that was picked is the port that comes back.
  await gateway.recover();
  const again = gateway.listening;
  assert.deepEqual(again.listen, [first, second]);
  assert.ok(again.listenKept?.startsWith(gateway.dataDir), "it names the file it read, in its data directory");
  assert.equal(await canConnect(second), true);
  assert.equal((await gateway.stop()).code, 0);

  await gateway.recover([loopback]);
  const replaced = gateway.listening.listen;
  assert.equal(replaced.length, 1);
  assert.equal((await gateway.stop()).code, 0);
  await gateway.recover();
  assert.deepEqual(gateway.listening.listen, replaced, "and what was kept before is gone");
});

test("an address of every interface is refused, and one that can't be listened on stops the start", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");

  for (const every of ["0.0.0.0:7447", "[::]:7447", "[0:0:0:0:0:0:0:0]:7447"]) {
    for (const command of [["gateway", "serve", "--data", dataDir], ["up"]]) {
      const refused = await shrimpy([...command, "--listen", every]);
      assert.notEqual(refused.code, 0, `${command[0]} ${every}`);
      assert.ok(refused.stderr.includes(every), refused.stderr);
      assert.equal(refused.stdout, "", "nothing was started");
    }
  }
  // Text that is not an address is a mistake in how the command is typed.
  for (const wrong of ["7447", "localhost", ":7447", "::1:7447", "127.0.0.1:70000", "[127.0.0.1]:7447"]) {
    assert.equal((await shrimpy(["gateway", "serve", "--data", dataDir, "--listen", wrong])).code, 2, wrong);
  }

  // The port is taken, which is what a second gateway or any other server on it does.
  const other = createServer();
  await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
  stopAfter(t, () => new Promise<void>((resolve) => other.close(() => resolve())));
  const where = formatAddress({ host: "127.0.0.1", port: (other.address() as AddressInfo).port });

  const serve = await shrimpy(["gateway", "serve", "--data", dataDir, "--listen", where]);
  assert.equal(serve.code, 1);
  assert.ok(serve.stderr.includes(where), serve.stderr);
  const up = await shrimpy(["up", "--listen", where]);
  assert.equal(up.code, 1);
  assert.ok(up.stderr.includes(where), up.stderr);
  assert.equal((await shrimpy(["status"])).code, 1, "and no gateway is left");
});

test("up told to listen starts the gateway and chat server with no agents, and again from what was kept", { timeout }, async (t) => {
  useRuntimeDir(t);

  // With no agents and nothing to listen on, there is nothing to start.
  const nothing = await shrimpy(["up"]);
  assert.equal(nothing.code, 1);

  const told = launchUp(t, ["--listen", "127.0.0.1:0"]);
  await told.until(untilLinked("chat", "chat"));
  assert.equal((await told.programs()).length, 2, "the gateway and the chat server");
  const [first] = await whereItListens(t);
  assert.ok(first);
  assert.ok(told.output().stdout.includes(formatAddress(first)), "it says where the gateway listens");
  assert.equal(await canConnect(first), true);
  told.kill("SIGTERM");
  assert.equal((await told.finished).code, 0);
  assert.equal(await canConnect(first), false);

  // No --listen this time: the gateway listens where it did, and that is why up starts it in a folder with no agents.
  const kept = launchUp(t, []);
  await kept.until(untilLinked("chat", "chat"));
  assert.equal((await kept.programs()).length, 2);
  assert.deepEqual(await whereItListens(t), [first]);
  assert.ok(kept.output().stdout.includes(formatAddress(first)));

  // A gateway that is running can't be told to listen elsewhere. Saying so, and what to do, is what it does.
  const [second] = await freeAddresses(["127.0.0.1"]);
  assert.ok(second);
  const meanwhile = launchUp(t, ["--listen", formatAddress(second)]);
  const result = await meanwhile.finished;
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stderr.includes(formatAddress(second)), result.stderr);
  assert.equal(await canConnect(second), false);
  assert.deepEqual(await whereItListens(t), [first], "and the gateway is as it was");
  kept.kill("SIGTERM");
  assert.equal((await kept.finished).code, 0);
});
