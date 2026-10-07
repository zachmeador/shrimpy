import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { initHome, joinHome } from "../agent/index.ts";
import { readMembership } from "../contracts/agent/node.ts";
import { writeLink } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { startGateway } from "../gateway/index.ts";
import { eventually, stopAfter, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  serve,
  serveChat,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
  untilRegistered,
} from "./testing/index.ts";

/*
 * An agent apart from the gateway, through real programs. The gateway runs in this process and listens on loopback, the
 * chat server and each agent in a process of their own. The agent has a runtime directory and a Shrimpy folder of its
 * own, so it shares no socket with the gateway and reaches it only over the network entry.
 */

const timeout = 120_000;

test("an agent apart joins with an invitation link, answers a person, is listed as running, a copy of its home is turned away, and it is no longer listed when it stops", { timeout }, async (t) => {
  useRuntimeDir(t);
  const model = await startModelServer();
  stopAfter(t, () => model.close());
  const gateway = await startGateway({ dataDir: tempDir(t, "gateway-data"), listen: [{ host: "127.0.0.1", port: 0 }] });
  stopAfter(t, () => gateway.close());
  await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());

  // The person asks for an invitation for crab, and the link is the name, the address and the code.
  const { code, addresses } = await person.invite("crab");
  const [address] = addresses;
  assert.ok(address);
  const link = writeLink({ name: "crab", address, code });

  // Crab's home joins with the link, from code, and keeps the gateway's address beside its token.
  const apart = {
    SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-apart"),
    SHRIMPY_DIR: join(tempDir(t, "apart-folder"), "shrimpy"),
    HOME: tempDir(t, "apart-user"),
  };
  const home = join(tempDir(t, "apart-home"), "crab");
  initHome(home, { name: "crab", model: { provider: "local", id: "test-model" } });
  declareLocalModel(home, { url: model.url, model: "test-model" });
  const member = await joinHome(home, link);
  assert.deepEqual(readMembership(home)?.gateway, address);
  assert.equal(readMembership(home)?.memberId, member.id);

  const crab = await serve(t, home, [], { env: apart });
  assert.ok(crab.listening.socket.startsWith(apart.SHRIMPY_RUNTIME_DIR), "its sockets are in a directory of its own");
  await untilRegistered("agent", "crab");

  // The person's side: a message is answered, and the roster says the agent is running.
  const said = await shrimpy(["run", "crab", "hi"]);
  assert.equal(said.code, 0, said.stderr);
  assert.equal(said.stdout.trim(), "Hello from the test model.");
  const crabOnTheRoster = async () => (await person.members()).find((each) => each.id === member.id);
  assert.equal((await crabOnTheRoster())?.reachable, true);
  await assert.rejects(person.ticket({ kind: "agent", name: "crab" }), /can't be reached yet/);

  // A copy of the home holds the same token, and is turned away while the agent runs.
  const copy = join(tempDir(t, "apart-copy"), "crab");
  cpSync(home, copy, {
    recursive: true,
    filter: (source) => !source.startsWith(join(home, "runtime")) && !source.includes("agent.sqlite"),
  });
  const copying = shrimpyInBackground(["agent", "serve", copy], {
    env: { ...apart, SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-copy") },
    untilStopped: true,
  });
  stopAfter(t, async () => {
    copying.kill("SIGKILL");
    await copying.finished;
  });
  await until(() => copying.output().stderr.includes("already running"), "the copy to be turned away", 30_000);
  assert.equal((await person.members()).filter((each) => each.name === "crab").length, 1, "and it made no member of its own");
  const again = await shrimpy(["run", "crab", "hi again"]);
  assert.equal(again.stdout.trim(), "Hello from the test model.", "the agent that was running is still the one that answers");
  copying.kill("SIGTERM");
  assert.equal((await copying.finished).code, 0);

  // When crab stops, it is no longer listed as running, and it is still on the roster.
  const stopped = await crab.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  const gone = await eventually(crabOnTheRoster, (entry) => entry?.reachable === false, { what: "crab to stop being listed as running" });
  assert.equal(gone?.name, "crab");
  assert.deepEqual((await person.list()).map((program) => program.kind), ["chat"]);
});
