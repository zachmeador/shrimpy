import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { saveMembership } from "../../contracts/agent/node.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { runCli } from "../index.ts";
import { shrimpyCommand } from "../programs/index.ts";
import type { Account } from "../service/index.ts";
import { captureIo, serveChat, serveGateway, untilRegistered, useShrimpyDir } from "../testing/index.ts";
import { installService, serviceStatusLine, uninstallService } from "./install.ts";

/*
 * `gateway install` and `gateway uninstall`, against an account whose folder is the test's own and a stand-in for
 * the service manager that records what it was asked to run. Nothing here reaches a real service manager or a real
 * service directory.
 */

const timeout = 60_000;

/** Why a stand-in refuses to turn lingering on: what loginctl says when it needs an administrator. */
const NEEDS_ADMIN = "Failed to set linger: Interactive authentication required.";

interface StandIn {
  account: Account;
  /** Every command of the service manager that was run, as it is typed, in order. */
  ran: string[];
}

/**
 * An account of the test's own on `platform`, whose service manager is a record of what it was asked. It keeps
 * what a real one would answer about: whether the service runs, is loaded, and whether the account lingers.
 */
function standIn(t: TestContext, platform: NodeJS.Platform, options: { home?: string; refuseLingering?: boolean } = {}): StandIn {
  const ran: string[] = [];
  let running = false;
  let lingering = false;
  const account: Account = {
    platform,
    home: options.home ?? tempDir(t, "service-home"),
    user: "ubuntu",
    uid: 501,
    path: "/opt/node/bin:/usr/bin:/bin",
    run(command, args) {
      ran.push([command, ...args].join(" "));
      const ok = { code: 0, stdout: "", stderr: "" };
      const verb = args.find((arg) => !arg.startsWith("-")) ?? "";
      if (command === "systemctl") {
        if (verb === "is-active") return Promise.resolve({ code: running ? 0 : 3, stdout: running ? "active\n" : "inactive\n", stderr: "" });
        if (verb === "restart") running = true;
        if (verb === "disable") running = false;
      }
      if (command === "launchctl") {
        if (verb === "print") {
          return Promise.resolve(running ? { code: 0, stdout: "\tstate = running\n", stderr: "" } : { code: 113, stdout: "", stderr: "" });
        }
        if (verb === "bootstrap") running = true;
        if (verb === "bootout") running = false;
      }
      if (command === "loginctl") {
        if (verb === "show-user") return Promise.resolve({ ...ok, stdout: `Linger=${lingering ? "yes" : "no"}\n` });
        if (options.refuseLingering === true) return Promise.resolve({ code: 1, stdout: "", stderr: `${NEEDS_ADMIN}\n` });
        if (verb === "enable-linger") lingering = true;
      }
      return Promise.resolve(ok);
    },
  };
  return { account, ran };
}

/** Make the agent called `name` in the Shrimpy folder, so that there is something for a service to start. */
async function makeAgent(name: string): Promise<void> {
  const made = captureIo();
  assert.equal(await runCli(["agent", "init", name, "--model", "local/test-model"], made.io), 0, made.err.join("\n"));
}

/** The first line of a file that starts with `start`. */
function lineStarting(text: string, start: string): string {
  const line = text.split("\n").find((candidate) => candidate.startsWith(start));
  assert.ok(line !== undefined, `no line starts with ${start} in:\n${text}`);
  return line;
}

/** Whether `ran` holds these commands, in this order, not necessarily next to each other. */
function ranInOrder(ran: string[], ...commands: string[]): boolean {
  let from = 0;
  for (const command of commands) {
    const at = ran.indexOf(command, from);
    if (at === -1) return false;
    from = at + 1;
  }
  return true;
}

test("on Linux, install writes a user unit that runs this Shrimpy's up with the installer's PATH, loads and starts it and turns lingering on; again, it updates and restarts; uninstall stops and removes it", async (t) => {
  useRuntimeDir(t);
  const folder = useShrimpyDir(t);
  // The folder is the default one of this account, which has the plain name.
  const { account, ran } = standIn(t, "linux", { home: dirname(folder) });
  await makeAgent("scout");
  const unit = join(account.home, ".config", "systemd", "user", "shrimpy.service");
  const first = captureIo();

  assert.equal(await installService(first.io, account), 0, first.err.join("\n"));

  const text = readFileSync(unit, "utf8");
  const start = lineStarting(text, "ExecStart=");
  for (const word of shrimpyCommand()) assert.ok(start.includes(word), `ExecStart runs ${word}`);
  assert.ok(start.endsWith(" up"));
  assert.ok(lineStarting(text, 'Environment="PATH=').includes(account.path ?? ""), "it has the PATH of the shell that installed it");
  assert.ok(!text.includes("SHRIMPY_DIR"), "the default folder is not named");
  assert.ok(text.includes("Restart=on-failure"));
  assert.match(text, /^TimeoutStopSec=\d+$/m);
  assert.ok(
    ranInOrder(ran, "systemctl --user daemon-reload", "systemctl --user enable shrimpy.service", "systemctl --user restart shrimpy.service"),
    ran.join("\n"),
  );
  assert.ok(ran.includes("loginctl --no-ask-password enable-linger ubuntu"), "and lingering is turned on");
  assert.ok(first.out.some((line) => line.includes(unit)), "it says where the file is");
  assert.match((await serviceStatusLine(account)) ?? "", /shrimpy\.service/);
  assert.ok(!(await serviceStatusLine(account))?.includes("not running"), "and that it runs");

  // Run again with another PATH: the unit is written again, the service restarted, and the command says it did.
  const again = captureIo();
  const restarts = ran.filter((command) => command.includes("restart")).length;
  assert.equal(await installService(again.io, { ...account, path: "/other/bin:/usr/bin" }), 0, again.err.join("\n"));

  assert.ok(lineStarting(readFileSync(unit, "utf8"), 'Environment="PATH=').includes("/other/bin"));
  assert.equal(ran.filter((command) => command.includes("restart")).length, restarts + 1);
  assert.notEqual(again.out[0], first.out[0], "it says which it did");

  const removed = captureIo();
  const before = ran.length;
  assert.equal(await uninstallService(removed.io, account), 0, removed.err.join("\n"));

  assert.ok(ranInOrder(ran.slice(before), "systemctl --user disable --now shrimpy.service"), ran.slice(before).join("\n"));
  assert.equal(existsSync(unit), false);
  assert.ok(existsSync(join(folder, "agents", "scout", "agent.json")), "nothing of Shrimpy's is deleted");
  assert.ok(removed.out.some((line) => line.includes("disable-linger")), "and it says how to turn lingering off");
  assert.ok((await serviceStatusLine(account))?.includes("shrimpy gateway install"), "the service is gone");

  // With no service installed it says so, asks the service manager nothing, and succeeds.
  const none = captureIo();
  const asked = ran.length;
  assert.equal(await uninstallService(none.io, account), 0);
  assert.equal(ran.length, asked);
  assert.notEqual(none.out.length, 0);
});

test("on macOS, install writes a LaunchAgent that runs this Shrimpy's up with the installer's PATH and prints to a log, loads it; again, it loads it anew; uninstall unloads and removes it", async (t) => {
  useRuntimeDir(t);
  const folder = useShrimpyDir(t);
  const { account, ran } = standIn(t, "darwin", { home: dirname(folder) });
  await makeAgent("scout");
  const agent = join(account.home, "Library", "LaunchAgents", "shrimpy.plist");
  const first = captureIo();

  assert.equal(await installService(first.io, account), 0, first.err.join("\n"));

  const text = readFileSync(agent, "utf8");
  for (const word of [...shrimpyCommand(), "up"]) assert.ok(text.includes(`<string>${word}</string>`), `it runs ${word}`);
  assert.ok(text.includes(`<string>${account.path ?? ""}</string>`), "with the PATH of the shell that installed it");
  assert.ok(!text.includes("SHRIMPY_DIR"), "the default folder is not named");
  assert.ok(text.includes("<key>KeepAlive</key>"));
  const log = join(account.home, "Library", "Logs", "shrimpy.log");
  assert.ok(text.includes(`<string>${log}</string>`), "what it prints goes to a log");
  assert.ok(first.out.some((line) => line.includes(log)), "and the command says where");
  assert.ok(first.out.some((line) => line.includes(agent)), "and where the file is");
  assert.ok(ran.includes(`launchctl bootstrap gui/501 ${agent}`), ran.join("\n"));

  // Run again: the loaded service is unloaded and loaded anew, so that it runs the file as it is now.
  const again = captureIo();
  const before = ran.length;
  assert.equal(await installService(again.io, account), 0, again.err.join("\n"));

  assert.ok(ranInOrder(ran.slice(before), "launchctl bootout gui/501/shrimpy", `launchctl bootstrap gui/501 ${agent}`), ran.slice(before).join("\n"));
  assert.notEqual(again.out[0], first.out[0], "it says which it did");

  const removed = captureIo();
  const loaded = ran.length;
  assert.equal(await uninstallService(removed.io, account), 0, removed.err.join("\n"));

  assert.ok(ran.slice(loaded).includes("launchctl bootout gui/501/shrimpy"), ran.slice(loaded).join("\n"));
  assert.equal(existsSync(agent), false);
  assert.ok(existsSync(join(folder, "agents", "scout", "agent.json")), "nothing of Shrimpy's is deleted");
});

test("two folders get two services, the default folder's with the plain name, and the service is told a folder that is not the default", async (t) => {
  useRuntimeDir(t);
  const first = useShrimpyDir(t);
  const { account, ran } = standIn(t, "linux", { home: dirname(first) });
  await makeAgent("scout");
  assert.equal(await installService(captureIo().io, account), 0);

  // The folder SHRIMPY_DIR names now, which is put back when the test ends.
  const second = join(tempDir(t, "elsewhere"), "crab-folder");
  process.env.SHRIMPY_DIR = second;
  await makeAgent("crab");
  assert.equal(await installService(captureIo().io, account), 0);

  const directory = join(account.home, ".config", "systemd", "user");
  const units = readdirSync(directory).filter((file) => file.endsWith(".service"));
  assert.equal(units.length, 2, units.join(", "));
  assert.ok(units.includes("shrimpy.service"));
  const other = units.find((file) => file !== "shrimpy.service") ?? "";
  assert.ok(!readFileSync(join(directory, "shrimpy.service"), "utf8").includes("SHRIMPY_DIR"));
  assert.ok(readFileSync(join(directory, other), "utf8").includes(`SHRIMPY_DIR=${second}`), "the other is told its folder");
  assert.ok(ran.includes(`systemctl --user restart ${other}`) && ran.includes("systemctl --user restart shrimpy.service"));

  // Taking one away leaves the other.
  assert.equal(await uninstallService(captureIo().io, account), 0);
  assert.equal(existsSync(join(directory, other)), false);
  assert.ok(existsSync(join(directory, "shrimpy.service")));
});

test("lingering that is refused still leaves the service installed and started, and install prints the command that turns it on", async (t) => {
  useRuntimeDir(t);
  const folder = useShrimpyDir(t);
  const { account, ran } = standIn(t, "linux", { home: dirname(folder), refuseLingering: true });
  await makeAgent("scout");
  const installed = captureIo();

  assert.equal(await installService(installed.io, account), 0, installed.err.join("\n"));

  assert.ok(existsSync(join(account.home, ".config", "systemd", "user", "shrimpy.service")));
  assert.ok(ran.includes("systemctl --user restart shrimpy.service"), "the service was started all the same");
  assert.ok(installed.out.some((line) => line.includes("sudo loginctl enable-linger ubuntu")), "and it says what turns lingering on");
  assert.ok(installed.out.some((line) => line.includes(NEEDS_ADMIN)), "and why it was refused");
});

test("install says what the service runs: only the agents, and where their gateway is, when they all belong to a gateway elsewhere; and nothing is installed when there is nothing to start", async (t) => {
  useRuntimeDir(t);
  const folder = useShrimpyDir(t);
  const { account, ran } = standIn(t, "linux", { home: dirname(folder) });

  // A folder with no agents, and no address for a gateway to listen on, leaves a service nothing to start.
  await assert.rejects(installService(captureIo().io, account));
  assert.equal(ran.length, 0, "the service manager was not asked anything");
  assert.equal(existsSync(join(account.home, ".config")), false, "and nothing was written");

  await makeAgent("crab");
  saveMembership(join(folder, "agents", "crab"), { token: newToken(), gateway: { host: "100.101.102.103", port: 7447 } });
  const installed = captureIo();

  assert.equal(await installService(installed.io, account), 0, installed.err.join("\n"));

  assert.ok(installed.out.some((line) => line.includes("100.101.102.103:7447")), "it says where their gateway is");
});

test("install notices that shrimpy up already runs for the folder, and installs nothing", { timeout }, async (t) => {
  useRuntimeDir(t);
  const folder = useShrimpyDir(t);
  // A folder with no agents that listens for agents elsewhere: `up` starts the gateway and the chat server.
  mkdirSync(join(folder, "agents"), { recursive: true });
  await serveGateway(t, ["--listen", "127.0.0.1:0"], join(folder, "gateway"));
  await serveChat(t, join(folder, "chat"));
  await untilRegistered("chat", "chat");
  const { account, ran } = standIn(t, "linux", { home: dirname(folder) });

  await assert.rejects(installService(captureIo().io, account), (error: Error) => {
    assert.ok(error.message.includes(folder), "it names the folder");
    return true;
  });

  assert.equal(existsSync(join(account.home, ".config")), false, "nothing was written");
  assert.deepEqual(ran.filter((command) => command.includes("restart") || command.includes("enable")), []);
});
