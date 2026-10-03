import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { type Context, defineService } from "@earendil-works/chord";
import { DisconnectedError } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { offer, startChild, startStandIn, useRuntimeDir } from "../testing/index.ts";
import { isNotListening, openConnection } from "./index.ts";

const timeout = 15_000;

interface Greeter {
  greet(name: string, context: Context): Promise<string>;
}
const Greeter = defineService<Greeter>("shrimpy.test.greeter");

/** What connecting to a Greeter on `socket` fails with, expecting a server with a random ID. */
function connectionFailure(socket: string, serverId = randomUUID()): Promise<unknown> {
  return openConnection({
    serverId,
    transportFactory: createUnixTransportFactory({ path: socket }),
    service: Greeter,
  }).then(
    () => assert.fail("the connection was made"),
    (error: unknown) => error,
  );
}

const withCode = (code: string): DisconnectedError =>
  new DisconnectedError("could not connect", Object.assign(new Error(code), { code }));

test("a socket that is gone, or that nothing answers on, is nobody listening", () => {
  assert.equal(isNotListening(withCode("ENOENT")), true);
  assert.equal(isNotListening(withCode("ECONNREFUSED")), true);
});

test("any other failure says something more", () => {
  assert.equal(isNotListening(withCode("EACCES")), false);
  assert.equal(isNotListening(new DisconnectedError("lost it")), false);
  assert.equal(isNotListening(new Error("ENOENT")), false);
  assert.equal(isNotListening(Object.assign(new Error("gone"), { code: "ENOENT" })), false);
  assert.equal(isNotListening("ENOENT"), false);
  assert.equal(isNotListening(undefined), false);
});

test("connecting to a socket that does not exist fails as nobody listening", { timeout }, async (t) => {
  const missing = join(useRuntimeDir(t), "missing.sock");

  const failure = await connectionFailure(missing);

  assert.equal(isNotListening(failure), true);
});

test("connecting to a socket a dead process left behind fails as nobody listening", { timeout }, async (t) => {
  const stale = join(useRuntimeDir(t), "stale.sock");
  const source = `
    import { createServer } from "node:net";
    createServer().listen(${JSON.stringify(stale)}, () => console.log(JSON.stringify({ event: "listening" })));
  `;
  const child = await startChild(t, { source });
  await child.kill("SIGKILL");

  const failure = await connectionFailure(stale);

  assert.equal(isNotListening(failure), true);
});

async function failureFromAnotherServer(t: TestContext): Promise<unknown> {
  useRuntimeDir(t);
  const standIn = await startStandIn(t, "other", {
    offer: () => offer(Greeter, { greet: () => Promise.resolve("") }),
  });
  return connectionFailure(standIn.socket);
}

test("a server that answers as someone else is not nobody listening", { timeout }, async (t) => {
  const failure = await failureFromAnotherServer(t);

  assert.match(String(failure), /does not match/);
  assert.equal(isNotListening(failure), false);
});
