import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pagePortOfItsOwn } from "../contracts/gateway/testing/index.ts";
import { FakeTerminal, tempDir, useRuntimeDir, within } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { openTheConsole } from "./run.ts";
import type { Account } from "./service/index.ts";
import { captureIo, launchUp, onTheRoster, openConsoleOn, useShrimpyDir } from "./testing/index.ts";

/*
 * A bare `shrimpy` at a terminal on a machine with nothing set up, as a person meets it after the install script:
 * the answers a person types are fed in, a stand-in for systemd runs `shrimpy up` as a process of its own when it is
 * told to start the service, and the console opens on a terminal of the test's own. Nothing reaches a provider.
 */

const timeout = 90_000;
const CTRL_C = "\u0003";

/**
 * An account on Linux whose systemd is a stand-in: told to start the service, it launches `shrimpy up`, which is what
 * the unit runs, and it says the service runs from then on. With `failFirst` its first start fails, as one in a
 * container with no systemd does.
 */
function standInSystemd(t: TestContext, failFirst: boolean): Account {
  let running = false;
  let failing = failFirst;
  const ok = { code: 0, stdout: "", stderr: "" };
  return {
    platform: "linux",
    home: tempDir(t, "service-home"),
    user: "ubuntu",
    uid: 501,
    path: process.env.PATH ?? "",
    run(command, args) {
      const verb = args.find((arg) => !arg.startsWith("-")) ?? "";
      if (command === "loginctl") return Promise.resolve({ ...ok, stdout: "Linger=yes\n" });
      if (verb === "is-active") return Promise.resolve({ code: running ? 0 : 3, stdout: running ? "active\n" : "inactive\n", stderr: "" });
      if (verb === "restart") {
        if (failing) {
          failing = false;
          return Promise.resolve({ code: 1, stdout: "", stderr: "Failed to connect to bus: No medium found\n" });
        }
        launchUp(t, []);
        running = true;
      }
      return Promise.resolve(ok);
    },
    // Setting up never restarts the service apart from itself, as an update does.
    detach: () => Promise.reject(new Error("setting up detached a command")),
  };
}

test("a bare shrimpy with nothing set up signs in, names you and the first agent, keeps it running and opens its DM, picking up where it failed", { timeout }, async (t) => {
  useRuntimeDir(t);
  const folder = useShrimpyDir(t);
  // The page listens on a port of its own, as each test's does, and setting up keeps that setting.
  pagePortOfItsOwn(join(folder, "settings.json"));
  const account = standInSystemd(t, true);

  // Which provider, its key, the model agents start with, your name, and Enter for the agent's.
  const first = captureIo({ terminal: true, answers: ["groq", "gsk-made-up-for-the-test", "llama-3.3-70b-versatile", "zach", ""] });
  let opened = 0;
  const openConsole = (): Promise<number> => {
    opened += 1;
    return Promise.resolve(0);
  };
  const code = await runCli([], first.io, { account, openConsole });

  assert.equal(code, 1, "the service didn't start");
  assert.equal(opened, 0);
  assert.ok(existsSync(join(folder, "agents", "shrimpy", "agent.json")), "and the agent made before it is kept");

  // Again, with nothing scripted: every step done already is skipped, the service starts and the DM opens.
  const terminal = new FakeTerminal(100, 40);
  const { exited, untilScreen } = openConsoleOn(t, terminal, openTheConsole, { account });
  await untilScreen((screen) => screen.kind === "thread" && screen.who === "shrimpy" && screen.can.send, "a new thread in the DM with shrimpy");

  const you = await onTheRoster(t);
  assert.ok((await you.members()).some((member) => member.kind === "person" && member.name === "zach"), "you are called what you said");
  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  assert.equal(await within(30_000, exited, "the console to be left"), 0);
});
