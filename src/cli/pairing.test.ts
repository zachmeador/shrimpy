import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readMembership } from "../contracts/agent/node.ts";
import { hello, readAnswer, readLink, writeLink } from "../contracts/gateway/index.ts";
import { newToken, thisMachine } from "../contracts/gateway/node.ts";
import { dial } from "../lib/link/node.ts";
import { tempDir, until } from "../lib/testing/index.ts";
import {
  commandLines,
  launchUp,
  localProvider,
  onTheRoster,
  shrimpy,
  startModelServer,
  untilAnswering,
  untilLinked,
  useShrimpyDir,
} from "./testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { formatAddress } from "../lib/link/index.ts";

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

test("invite prints a line that lets an agent in from a folder of its own, where up starts only it", { timeout }, async (t) => {
  const model = await startModelServer(t);

  // The gateway's folder has no agents. It is told to listen, so up starts the gateway and the chat server all the same.
  const gateway = launchUp(t, ["--listen", "127.0.0.1:0"]);
  await gateway.until(untilLinked("chat", "chat"));
  assert.equal((await gateway.programs()).length, 2);

  // The line to paste where the agent will live is taken from what the command prints.
  const invited = await shrimpy(["invite", "crab"]);
  assert.equal(invited.code, 0, invited.stderr);
  const [line] = commandLines(invited.stdout);
  assert.ok(line !== undefined && line.startsWith("shrimpy join "), invited.stdout);
  const link = line.slice("shrimpy join ".length);
  const { address, fingerprint } = readLink(link);

  // The agent's folder and runtime directory are another's, and a model is given to the folder as signing in leaves it.
  const apart = apartEnv(t);
  const joined = await shrimpy(["join", link], { env: apart });
  assert.equal(joined.code, 0, joined.stderr);
  assert.deepEqual(readMembership(join(apart.SHRIMPY_DIR, "agents", "crab"))?.gateway, { ...address, fingerprint }, "the home keeps the gateway's key with its address");
  const providers = join(apart.SHRIMPY_DIR, "providers");
  mkdirSync(providers, { recursive: true });
  writeFileSync(join(providers, "default-model.json"), JSON.stringify({ provider: "local", id: "test-model" }));
  writeFileSync(join(providers, "models.json"), JSON.stringify({ providers: { local: localProvider({ url: model.url, models: ["test-model"] }) } }));
  writeFileSync(join(providers, "auth.json"), JSON.stringify({ local: { type: "api_key", key: "folder-key" } }));

  // Where the agent lives, up starts the agent, and neither a gateway nor a chat server, and says who it is talked to from.
  const there = launchUp(t, [], { env: apart });
  await there.until(untilAnswering(join(apart.SHRIMPY_DIR, "agents", "crab")));
  assert.equal((await there.programs()).length, 1, "only the agent");
  // It says which gateway the agent belongs to in the line after the one that says it is running, which may arrive a moment later.
  await until(() => there.output().stdout.includes(formatAddress(address)), "up to say which gateway the agent belongs to");
  const said = there.output().stdout;
  assert.ok(!said.includes("shrimpy run") && !said.includes("shrimpy status"), "and no hint that works only beside a gateway");
  assert.deepEqual(readdirSync(apart.SHRIMPY_RUNTIME_DIR).filter((name) => /^(gateway|chat)/.test(name)), [], "nor a socket of theirs");

  // From the gateway's folder, the agent is on the roster and answers.
  await untilLinked("agent", "crab");
  const reply = await shrimpy(["run", "crab", "hi"]);
  assert.equal(reply.code, 0, reply.stderr);
  assert.equal(reply.stdout, "Hello from the test model.\n");

  there.kill("SIGTERM");
  assert.equal((await there.finished).code, 0);
  gateway.kill("SIGTERM");
  assert.equal((await gateway.finished).code, 0);
});

test("a line pasted again where another folder used it is refused, and no second agent joins", { timeout }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const person = await onTheRoster(t);
  const { code, fingerprint } = await person.invite("crab");
  const link = writeLink({ name: "crab", address, code, fingerprint });

  const first = await shrimpy(["join", link], { env: apartEnv(t) });
  assert.equal(first.code, 0, first.stderr);

  // What the gateway says to a code that is used up, as another connection hears it.
  const said = hello({ kind: "join", name: "crab", token: newToken(), code }, thisMachine());
  const { answer, linked } = await dial({ ...address, fingerprint }, said);
  linked.drop();
  const turned = readAnswer(answer);
  assert.ok(turned?.kind === "refused", "the gateway let a second agent in with a code that was used");
  const says = turned.words;

  const folder = useShrimpyDir(t);
  const second = await shrimpy(["join", link]);
  assert.equal(second.code, 1);
  assert.ok(second.stderr.includes(says), second.stderr);
  assert.ok(existsSync(join(folder, "agents", "crab", "agent.json")), "the home it made stays");
  assert.equal(readMembership(join(folder, "agents", "crab"))?.memberId, undefined, "and is no member");
  assert.equal((await person.members()).filter((member) => member.name === "crab").length, 1);
});
