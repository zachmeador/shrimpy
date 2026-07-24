import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  gatewayCtl,
  gatewayServiceManager,
  gatewayServicePaths,
  generateLaunchAgentPlist,
  generateSystemdUnit,
  readGatewayServiceStatus,
} from "../dist/gateway/service/index.js";
import {
  ensureShrimpyRuntimeEnvironment,
  pathWithShrimpyRuntimeBin,
  resolveShrimpyRuntimeEnvironment,
} from "../dist/app/environment.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-gateway-ctl-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("gateway service manager", () => {
  test("selects systemd on Linux, launchd on macOS, and manual elsewhere", () => {
    assert.equal(gatewayServiceManager("linux"), "systemd");
    assert.equal(gatewayServiceManager("darwin"), "launchd");
    assert.equal(gatewayServiceManager("freebsd"), "manual");
  });

  test("generates a macOS LaunchAgent plist with command, logs, and PATH", () => {
    const workspace = "/Users/alice/.shrimpy-dev";
    const env = resolveShrimpyRuntimeEnvironment(workspace);
    const plist = generateLaunchAgentPlist({
      node: "/opt/homebrew/bin/node",
      script: "/Users/alice/shrimpy/dist/gateway.js",
      homeDir: "/Users/alice",
      logPath: "/Users/alice/Library/Logs/Shrimpy/gateway.launchd.log",
      env: { PATH: "/opt/homebrew/bin:/usr/bin" } as NodeJS.ProcessEnv,
      workspace,
    });

    assert.match(plist, new RegExp(`<string>${escapeRegExp(env.launchdLabel)}<\\/string>`));
    assert.match(plist, /<string>\/opt\/homebrew\/bin\/node<\/string>/);
    assert.match(plist, /<string>\/Users\/alice\/shrimpy\/dist\/gateway\.js<\/string>/);
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>SuccessfulExit<\/key>\s*<false\/>/);
    assert.match(plist, new RegExp(`<key>PATH<\\/key>\\s*<string>${escapeRegExp(`${env.binDir}:/opt/homebrew/bin:/usr/bin:/Users/alice/.local/bin`)}<\\/string>`));
    assert.match(plist, /<key>SHRIMPY_WORKSPACE<\/key>\s*<string>\/Users\/alice\/\.shrimpy-dev<\/string>/);
    assert.match(plist, /gateway\.launchd\.log/);
  });

  test("generates a Linux systemd user unit with PATH", () => {
    const workspace = "/home/alice/.shrimpy-dev";
    const env = resolveShrimpyRuntimeEnvironment(workspace);
    const unit = generateSystemdUnit({
      node: "/usr/bin/node",
      script: "/home/alice/shrimpy/dist/gateway.js",
      homeDir: "/home/alice",
      env: { PATH: "/usr/bin:/bin" } as NodeJS.ProcessEnv,
      workspace,
    });

    assert.match(unit, new RegExp(`Environment="PATH=${escapeRegExp(`${env.binDir}:/usr/bin:/bin:/home/alice/.local/bin`)}"`));
    assert.match(unit, /Environment="SHRIMPY_WORKSPACE=\/home\/alice\/\.shrimpy-dev"/);
    assert.match(unit, /ExecStart=\/usr\/bin\/node \/home\/alice\/shrimpy\/dist\/gateway\.js/);
  });

  test("generates a Linux systemd user unit with workspace and no PATH when none is provided", () => {
    const unit = generateSystemdUnit({
      env: {} as NodeJS.ProcessEnv,
      workspace: "/home/alice/.shrimpy-dev",
    });

    assert.doesNotMatch(unit, /Environment="PATH=/);
    assert.match(unit, /Environment="SHRIMPY_WORKSPACE=\/home\/alice\/\.shrimpy-dev"/);
    assert.match(unit, /ExecStart=.*gateway\.js/);
  });

  test("escapes systemd PATH values", () => {
    const workspace = "/home/alice/.shrimpy-dev";
    const env = resolveShrimpyRuntimeEnvironment(workspace);
    const unit = generateSystemdUnit({
      homeDir: "/home/alice",
      env: { PATH: '/opt/"node":/tmp/100%:/usr/bin' } as NodeJS.ProcessEnv,
      workspace,
    });

    assert.match(unit, new RegExp(`Environment="PATH=${escapeRegExp(`${env.binDir}:/opt/\\"node\\":/tmp/100%%:/usr/bin:/home/alice/.local/bin`)}"`));
  });

  test("installs the Linux systemd user unit with the caller PATH", async () => {
    const calls: string[][] = [];
    const workspace = join(testDir, "workspace");
    const paths = gatewayServicePaths({
      platform: "linux",
      homeDir: testDir,
      workspace,
    });

    await captureConsole(() =>
      gatewayCtl("install", {
        pidPath: join(testDir, "gateway.pid"),
        workspace,
        deps: {
          platform: "linux",
          homeDir: testDir,
          env: { PATH: "/usr/local/bin:/usr/bin" } as NodeJS.ProcessEnv,
          execFileSync: (file, args) => {
            calls.push([file, ...args]);
            return "";
          },
        },
      })
    );

    assert.equal(existsSync(paths.unitPath), true);
    const unit = readFileSync(paths.unitPath, "utf-8");
    assert.equal(unit.includes(`PATH=${join(workspace, "runtime", "bin")}:/usr/local/bin:/usr/bin:`), true);
    assert.equal(unit.includes(`Environment="SHRIMPY_WORKSPACE=${workspace}"`), true);
    assert.equal(unit.includes(`${testDir}/.local/bin`), true);
    assert.match(unit, /ExecStart=.*gateway\.js/);
    assert.deepEqual(calls, [
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "enable", paths.serviceName],
    ]);
  });

  test("starts an installed macOS LaunchAgent through launchctl bootstrap and kickstart", async () => {
    const calls: string[][] = [];
    const workspace = join(testDir, "workspace");
    const paths = gatewayServicePaths({ platform: "darwin", homeDir: testDir, uid: 501, workspace });
    mkdirSync(paths.launchAgentDir, { recursive: true });
    writeFileSync(paths.launchAgentPath, "plist", "utf-8");

    await captureConsole(() =>
      gatewayCtl("start", {
        pidPath: join(testDir, "gateway.pid"),
        deps: {
          platform: "darwin",
          homeDir: testDir,
          uid: 501,
          workspace,
          execFileSync: (file, args) => {
            calls.push([file, ...args]);
            return "";
          },
        },
      })
    );

    assert.deepEqual(calls, [
      ["launchctl", "bootstrap", "gui/501", paths.launchAgentPath],
      ["launchctl", "kickstart", "-k", `gui/501/${paths.launchdLabel}`],
    ]);
  });

  test("reads Linux service status through systemctl --user", () => {
    const calls: string[][] = [];
    const status = readGatewayServiceStatus({
      platform: "linux",
      homeDir: "/home/alice",
      workspace: "/home/alice/.shrimpy-dev",
      spawnSync: (file, args) => {
        calls.push([file, ...args]);
        return {
          status: 0,
          stdout: args.includes("is-active") ? "active\n" : "enabled\n",
        };
      },
    });

    assert.equal(status.manager, "systemd");
    assert.equal(status.active, "active");
    assert.equal(status.enabled, "enabled");
    assert.match(status.serviceName, /^shrimpy-gateway-[a-f0-9]{12}$/);
    assert.equal(status.definitionPath, `/home/alice/.config/systemd/user/${status.serviceName}.service`);
    assert.deepEqual(calls, [
      ["systemctl", "--user", "is-active", status.serviceName],
      ["systemctl", "--user", "is-enabled", status.serviceName],
    ]);
  });

  test("reads macOS service status from launchd and LaunchAgent path", () => {
    const workspace = join(testDir, "workspace");
    const paths = gatewayServicePaths({ platform: "darwin", homeDir: testDir, uid: 501, workspace });
    const calls: string[][] = [];
    const status = readGatewayServiceStatus({
      platform: "darwin",
      homeDir: testDir,
      uid: 501,
      workspace,
      existsSync: (path) => path === paths.launchAgentPath,
      spawnSync: (file, args) => {
        calls.push([file, ...args]);
        return { status: 0, stdout: "service = loaded\n" };
      },
    });

    assert.equal(status.manager, "launchd");
    assert.equal(status.serviceName, paths.launchdLabel);
    assert.equal(status.active, "active");
    assert.equal(status.enabled, "installed");
    assert.equal(status.definitionPath, paths.launchAgentPath);
    assert.equal(status.serviceLogPath, paths.launchdLogPath);
    assert.deepEqual(calls, [
      ["launchctl", "print", `gui/501/${paths.launchdLabel}`],
    ]);
  });

  test("creates workspace-local command shims and prepends them to PATH", () => {
    const workspace = join(testDir, "workspace");
    const env = ensureShrimpyRuntimeEnvironment(workspace);
    const shimPath = join(env.binDir, "shrimpy");

    assert.equal(existsSync(shimPath), true);
    assert.match(readFileSync(shimPath, "utf-8"), new RegExp(`--workspace '${escapeRegExp(workspace)}'`));
    assert.equal(
      pathWithShrimpyRuntimeBin("/usr/bin", env, testDir),
      `${env.binDir}:/usr/bin:${testDir}/.local/bin`,
    );
  });

});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function captureConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
