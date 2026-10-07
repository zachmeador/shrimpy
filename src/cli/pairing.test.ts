import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readMembership } from "../contracts/agent/node.ts";
import { connectGateway, entryTransports, formatAddress, readLink, writeLink } from "../contracts/gateway/index.ts";
import { connectLocalGateway, newToken } from "../contracts/gateway/node.ts";
import { stopAfter, tempDir } from "../lib/testing/index.ts";
import {
  commandLines,
  localProvider,
  serveGateway,
  shrimpy,
  startModelServer,
  startUp,
  untilRegistered,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * Letting an agent in from a folder that shares nothing with the gateway's, through the real commands: the gateway
 * listens on loopback and is started in one folder with one runtime directory, and the agent's folder has another of
 * each, so that nothing but the network entry joins them.
 */

const timeout = 120_000;

/** What a command that runs where the agent lives is started with: a Shrimpy folder, a runtime directory and a user's directory of its own. */
function apartEnv(t: TestContext): { SHRIMPY_DIR: string; SHRIMPY_RUNTIME_DIR: string; HOME: string } {
  return {
    SHRIMPY_DIR: join(tempDir(t, "apart-folder"), "shrimpy"),
    SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-apart"),
    HOME: tempDir(t, "apart-user"),
  };
}

test("members invite prints a line that lets an agent in from a folder of its own, where shrimpy up starts it and no gateway or chat server, and a message sent from the gateway's folder is answered", { timeout }, async (t) => {
  const model = await startModelServer();
  stopAfter(t, () => model.close());

  // The gateway's folder has no agents. It is told to listen, so up starts the gateway and the chat server all the same.
  const gateway = await startUp(t, ["--listen", "127.0.0.1:0"]);
  assert.equal(gateway.programs().length, 2);

  // The line to paste where the agent will live is taken from what the command prints.
  const invited = await shrimpy(["members", "invite", "crab"]);
  assert.equal(invited.code, 0, invited.stderr);
  const [line] = commandLines(invited.stdout);
  assert.ok(line !== undefined && line.startsWith("shrimpy agent join "), invited.stdout);
  const link = line.slice("shrimpy agent join ".length);
  const { address } = readLink(link);

  // The agent's folder and runtime directory are another's, and a model is given to the folder as signing in leaves it.
  const apart = apartEnv(t);
  const joined = await shrimpy(["agent", "join", link], { env: apart });
  assert.equal(joined.code, 0, joined.stderr);
  const providers = join(apart.SHRIMPY_DIR, "providers");
  mkdirSync(providers, { recursive: true });
  writeFileSync(join(providers, "default-model.json"), JSON.stringify({ provider: "local", id: "test-model" }));
  writeFileSync(join(providers, "models.json"), JSON.stringify({ providers: { local: localProvider({ url: model.url, models: ["test-model"] }) } }));
  writeFileSync(join(providers, "auth.json"), JSON.stringify({ local: { type: "api_key", key: "folder-key" } }));

  // Where the agent lives, up starts the agent, and neither a gateway nor a chat server, and says who it is talked to from.
  const there = await startUp(t, [], { env: apart });
  assert.equal(there.programs().length, 1, "only the agent");
  const said = there.output().stdout;
  assert.doesNotMatch(said, /gateway \(pid|chat server \(pid/);
  assert.ok(!said.includes("shrimpy run") && !said.includes("gateway status"), "and no hint that works only beside a gateway");
  assert.ok(said.includes(formatAddress(address)), "it says which gateway the agent belongs to");
  assert.deepEqual(readdirSync(apart.SHRIMPY_RUNTIME_DIR).filter((name) => /^(gateway|chat)/.test(name)), [], "nor a socket of theirs");

  // From the gateway's folder, the agent is on the roster and answers.
  await untilRegistered("agent", "crab");
  const reply = await shrimpy(["run", "crab", "hi"]);
  assert.equal(reply.code, 0, reply.stderr);
  assert.equal(reply.stdout, "Hello from the test model.\n");

  there.kill("SIGTERM");
  assert.equal((await there.finished).code, 0);
  gateway.kill("SIGTERM");
  assert.equal((await gateway.finished).code, 0);
});

test("a line pasted again where another folder used it is refused as the gateway says it, the folder keeps the home it made, and no second agent joined", { timeout }, async (t) => {
  const gateway = await serveGateway(t, ["--listen", "127.0.0.1:0"]);
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  const { code } = await person.invite("crab");
  const link = writeLink({ name: "crab", address, code });

  const first = await shrimpy(["agent", "join", link], { env: apartEnv(t) });
  assert.equal(first.code, 0, first.stderr);

  // What the gateway says to a code that is used up, as another connection hears it.
  const apartConnection = await connectGateway({ transportFactory: entryTransports(address).gateway });
  stopAfter(t, () => apartConnection.close());
  const says = await apartConnection.join("crab", newToken(), code).then(
    () => undefined,
    (error: unknown) => (error as Error).message,
  );
  assert.ok(says !== undefined, "the gateway let a second agent in with a code that was used");

  const folder = useShrimpyDir(t);
  const second = await shrimpy(["agent", "join", link]);
  assert.equal(second.code, 1);
  assert.ok(second.stderr.includes(says), second.stderr);
  assert.ok(existsSync(join(folder, "agents", "crab", "agent.json")), "the home it made stays");
  assert.equal(readMembership(join(folder, "agents", "crab"))?.memberId, undefined, "and is no member");
  assert.equal((await person.members()).filter((member) => member.name === "crab").length, 1);
});
