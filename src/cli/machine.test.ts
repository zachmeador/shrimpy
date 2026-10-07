import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { initHome, joinHome } from "../agent/index.ts";
import type { Message } from "../contracts/chat/index.ts";
import { AGENT_HOME_VARIABLE } from "../contracts/agent/index.ts";
import { formatAddress, machineFile, writeLink } from "../contracts/gateway/index.ts";
import { connectLocalGateway, joinAsMachine, newToken, saveMachine } from "../contracts/gateway/node.ts";
import { inRuntimeDir, stopAfter, tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { openTheConsole } from "./run.ts";
import {
  captureIo,
  declareLocalModel,
  FakeTerminal,
  type RunningUp,
  shrimpy,
  startModelServer,
  startUp,
  untilRegistered,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * A machine of the person's own, through the real commands and the terminal: the gateway, the chat server and an agent
 * run in one Shrimpy folder with one runtime directory, and the machine is another folder with another runtime
 * directory, so that nothing but the gateway's network entry joins them. Commands that run in the machine's folder are
 * run with this process's own environment, and those that run beside the gateway are given its environment.
 */

const timeout = 90_000;
const CTRL_C = "\u0003";
const TAB = "\t";

/** What a command that runs beside the gateway is started with: a Shrimpy folder, a runtime directory and a user's directory of its own. */
type Beside = { SHRIMPY_DIR: string; SHRIMPY_RUNTIME_DIR: string; HOME: string };

/**
 * The gateway on loopback, the chat server and the agent scout on a test model, started as `shrimpy up` does in a folder
 * of their own. This test's own folder and runtime directory are left for the machine.
 */
async function startBesideTheGateway(t: TestContext): Promise<{ env: Beside; up: RunningUp }> {
  const model = await startModelServer();
  stopAfter(t, () => model.close());
  useRuntimeDir(t);
  const env: Beside = {
    SHRIMPY_DIR: join(tempDir(t, "gateway-folder"), "shrimpy"),
    SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-gateway"),
    HOME: tempDir(t, "gateway-user"),
  };
  const home = join(tempDir(t, "scout-home"), "scout");
  const init = await shrimpy(["agent", "init", home, "--name", "scout", "--model", "local/test-model"], { env });
  assert.equal(init.code, 0, init.stderr);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  const up = await startUp(t, [home, "--data", tempDir(t, "gateway-data"), "--listen", "127.0.0.1:0"], { env });
  await inRuntimeDir(env.SHRIMPY_RUNTIME_DIR, () => untilRegistered("agent", "scout"));
  return { env, up };
}

/**
 * Make this test's own Shrimpy folder a machine of the person who runs the gateway beside which `env` runs. Says where
 * the gateway listens, and gives the person's connection to it, on its own socket.
 */
async function joinAsTheMachine(t: TestContext, env: Beside) {
  const onTheSocket = await inRuntimeDir(env.SHRIMPY_RUNTIME_DIR, () => connectLocalGateway());
  stopAfter(t, () => onTheSocket.close());
  const { code, addresses } = await onTheSocket.inviteMachine();
  const [address] = addresses;
  assert.ok(address);
  await joinAsMachine(useShrimpyDir(t), { name: null, address, code });
  return { address, onTheSocket };
}

const person = userInfo().username;

test("commands in a folder that joined as the person reach the gateway there as the person, the same member as beside the gateway, while a command in an agent's shell is still the agent, and a gateway that is gone or does not know the machine says so", { timeout }, async (t) => {
  const { env, up } = await startBesideTheGateway(t);
  const { address, onTheSocket } = await joinAsTheMachine(t, env);

  const members = await shrimpy(["members"]);
  assert.equal(members.code, 0, members.stderr);
  assert.match(members.stdout, new RegExp(`${person}\\s+person\\s+yes`));
  assert.match(members.stdout, /scout\s+agent\s+no\s+yes/, "and the agent is running there");

  const said = await shrimpy(["run", "scout", "hi"]);
  assert.equal(said.code, 0, said.stderr);
  assert.equal(said.stdout, "Hello from the test model.\n");
  const thread = /Thread (th_\w+) started/.exec(said.stderr)?.[1];
  assert.ok(thread, said.stderr);

  // The thread is the person's on both sides: it is listed in the same DM, and the gateway's folder reads who wrote what.
  const idsOf = (stdout: string): string[] => (JSON.parse(stdout) as { id: string }[]).map((each) => each.id).sort();
  const here = await shrimpy(["threads", "scout", "--json"]);
  const there = await shrimpy(["threads", "scout", "--json"], { env });
  assert.deepEqual(idsOf(here.stdout), idsOf(there.stdout));
  assert.ok(idsOf(there.stdout).includes(thread));
  const read = await shrimpy(["read", thread, "--json"], { env });
  const { messages } = JSON.parse(read.stdout) as { messages: Message[] };
  assert.deepEqual(messages.map((message) => [message.author.name, message.text]), [
    [person, "hi"],
    ["scout", "Hello from the test model."],
  ]);

  // In the shell of an agent a command is still the agent, whatever the folder has joined: crab is no admin, and can't make a room.
  const crabHome = join(tempDir(t, "crab-home"), "crab");
  initHome(crabHome, { name: "crab" });
  await joinHome(crabHome, writeLink({ name: "crab", address, code: (await onTheSocket.invite("crab")).code }));
  const asCrab = await shrimpy(["rooms", "new", "ops"], { env: { [AGENT_HOME_VARIABLE]: crabHome } });
  assert.equal(asCrab.code, 1);
  assert.ok(asCrab.stderr.includes("crab"), asCrab.stderr);
  assert.equal((await shrimpy(["rooms", "new", "ops"])).code, 0, "while the person, in the machine's own folder, may");

  // A gateway that does not know the machine's token says so, and which file to delete to join again.
  const lost = join(tempDir(t, "lost"), "shrimpy");
  saveMachine(lost, { token: newToken(), gateway: address, member: { id: "mem_aaaaaaaaaaaa", name: person } });
  const unknown = await shrimpy(["members"], { env: { SHRIMPY_DIR: lost } });
  assert.equal(unknown.code, 1);
  assert.ok(unknown.stderr.includes(machineFile(lost)), unknown.stderr);

  // With the gateway gone, the command says which gateway it can't reach.
  up.kill("SIGTERM");
  assert.equal((await up.finished).code, 0);
  const down = await shrimpy(["members"]);
  assert.equal(down.code, 1);
  assert.ok(down.stderr.includes(formatAddress(address)), down.stderr);
});

test("the terminal in a folder that joined as the person signs in on its connection to the gateway there, lists the agent and reaches its sessions", { timeout }, async (t) => {
  const { env } = await startBesideTheGateway(t);
  await joinAsTheMachine(t, env);
  const said = await shrimpy(["run", "scout", "hi"]);
  const thread = /Thread (th_\w+) started/.exec(said.stderr)?.[1];
  assert.ok(thread, said.stderr);

  // The console is opened by the code a bare `shrimpy` runs, on a terminal of the test's own.
  const terminal = new FakeTerminal();
  const cli = captureIo({ terminal: true });
  const exited = runCli([], cli.io, { openConsole: (io) => openTheConsole(io, { terminal, pollMs: 100 }) });
  stopAfter(t, async () => {
    cli.requestStop();
    await exited.catch(() => undefined);
  });
  const seen = (text: string, what = text): Promise<void> =>
    until(() => terminal.text().includes(text), `the console to show ${what}`, 30_000);

  // One agent is running, so it goes straight to that agent, and the console knows the person it is.
  await seen("scout · your threads");
  terminal.type(TAB);
  await seen("scout · its sessions");
  await seen(`your DM · thread ${thread}`, "the session of the thread the person started, as theirs");

  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  assert.equal(await within(30_000, exited, "the console to be left"), 0);
});
