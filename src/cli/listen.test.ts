import assert from "node:assert/strict";
import { type AddressInfo, createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { test } from "node:test";
import { type Address, formatAddress } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import {
  canConnect,
  freeAddresses,
  isAlive,
  launchUp,
  serveGateway,
  shrimpy,
  startUp,
} from "./testing/index.ts";

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
async function whereItListens(): Promise<Address[]> {
  const gateway = await connectLocalGateway();
  try {
    return (await gateway.invite("probe")).addresses;
  } finally {
    await gateway.close();
  }
}

test("a gateway started again with no --listen listens where it did, says so and where that is kept, and --listen given again replaces it", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");

  // Given more than once, with an IPv6 address in brackets where this machine has one.
  const given = await serveGateway(t, ["--listen", "127.0.0.1:0", "--listen", hasIPv6Loopback ? "[::1]:0" : "127.0.0.1:0"], dataDir);
  const [first, second] = given.listening.listen;
  assert.ok(first && second && first.port > 0 && second.port > 0 && first.port !== second.port, "each got a port of its own");
  assert.equal(given.listening.listenKept, null, "it was told where to listen, so it read nothing");
  assert.equal(await canConnect(first), true);
  assert.equal((await given.stop()).code, 0);
  assert.equal(await canConnect(first), false);

  // What is kept is where it listened, so a port that was picked is the port that comes back.
  const again = await serveGateway(t, [], dataDir);
  assert.deepEqual(again.listening.listen, [first, second]);
  assert.ok(again.listening.listenKept?.startsWith(dataDir), "it names the file it read, in its data directory");
  assert.equal(await canConnect(second), true);
  assert.equal((await again.stop()).code, 0);

  const replaced = await serveGateway(t, ["--listen", "127.0.0.1:0"], dataDir);
  assert.equal(replaced.listening.listen.length, 1);
  assert.equal((await replaced.stop()).code, 0);
  const last = await serveGateway(t, [], dataDir);
  assert.deepEqual(last.listening.listen, replaced.listening.listen, "and what was kept before is gone");
});

test("an address that means every interface is refused before anything starts, and one that can't be listened on stops the start and says which", { timeout }, async (t) => {
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
  const started = [...up.stdout.matchAll(/^Started .* \(pid (\d+)\)/gm)].map((found) => Number(found[1]));
  assert.deepEqual(started.map(isAlive), [], "what up started is stopped");
  assert.equal((await shrimpy(["gateway", "status"])).code, 1, "and no gateway is left");
});

test("up that is told to listen starts the gateway and the chat server where there are no agents, says where the gateway listens, and does it again from what the gateway kept; a gateway that is running keeps its own addresses", { timeout }, async (t) => {
  useRuntimeDir(t);

  // With no agents and nothing to listen on, there is nothing to start.
  const nothing = await shrimpy(["up"]);
  assert.equal(nothing.code, 1);
  assert.match(nothing.stderr, /nothing to start/);

  const told = await startUp(t, ["--listen", "127.0.0.1:0"]);
  assert.equal(told.programs().length, 2, "the gateway and the chat server");
  const [first] = await whereItListens();
  assert.ok(first);
  assert.ok(told.output().stdout.includes(formatAddress(first)), "it says where the gateway listens");
  assert.equal(await canConnect(first), true);
  told.kill("SIGTERM");
  assert.equal((await told.finished).code, 0);
  assert.equal(await canConnect(first), false);

  // No --listen this time: the gateway listens where it did, and that is why up starts it in a folder with no agents.
  const kept = await startUp(t, []);
  assert.equal(kept.programs().length, 2);
  assert.deepEqual(await whereItListens(), [first]);
  assert.ok(kept.output().stdout.includes(formatAddress(first)));

  // A gateway that is running can't be told to listen elsewhere. Saying so, and what to do, is what it does.
  const [second] = await freeAddresses(["127.0.0.1"]);
  assert.ok(second);
  const meanwhile = launchUp(t, ["--listen", formatAddress(second)]);
  const result = await meanwhile.finished;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(meanwhile.programs(), []);
  assert.ok(result.stderr.includes(formatAddress(second)), result.stderr);
  assert.equal(await canConnect(second), false);
  assert.deepEqual(await whereItListens(), [first], "and the gateway is as it was");
  kept.kill("SIGTERM");
  assert.equal((await kept.finished).code, 0);
});
