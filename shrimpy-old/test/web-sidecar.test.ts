import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { resolveWebConfig } from "../dist/config/web.js";
import { WebSidecarManager } from "../dist/gateway/web-sidecar.js";

class FakeChild extends EventEmitter {
  pid = 321;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  kill(signal: NodeJS.Signals): boolean {
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
}

test("web config is default-on and validates its local port", () => {
  assert.deepEqual(resolveWebConfig(), { enabled: true, port: 5174 });
  assert.deepEqual(resolveWebConfig({ enabled: false, port: 6123 }), {
    enabled: false,
    port: 6123,
  });
  assert.throws(() => resolveWebConfig({ port: 70_000 }));
});

test("gateway starts the web sidecar with only workspace lifecycle arguments", async () => {
  const child = new FakeChild();
  const calls: unknown[][] = [];
  const manager = new WebSidecarManager(
    {
      enabled: true,
      port: 6123,
      workspace: "/workspace",
      scriptPath: "/app/dist/web/server.js",
    },
    {
      spawn(command: string, args: readonly string[]) {
        calls.push([command, ...args]);
        return child as never;
      },
      setTimeout,
      clearTimeout,
    },
  );
  manager.start();
  child.emit("spawn");
  assert.equal(manager.health().status, "running");
  assert.equal(manager.health().pid, 321);
  assert.deepEqual(calls[0]?.slice(1), [
    "/app/dist/web/server.js",
    "--workspace",
    "/workspace",
    "--host",
    "127.0.0.1",
    "--port",
    "6123",
  ]);
  await manager.stop();
  assert.equal(manager.health().status, "stopped");
});

test("disabled web sidecar never spawns", () => {
  let spawned = false;
  const manager = new WebSidecarManager(
    {
      enabled: false,
      port: 5174,
      workspace: "/workspace",
      scriptPath: "/web.js",
    },
    {
      spawn() {
        spawned = true;
        return new FakeChild() as never;
      },
      setTimeout,
      clearTimeout,
    },
  );
  manager.start();
  assert.equal(spawned, false);
  assert.equal(manager.health().status, "disabled");
});

test("unexpected web exits are non-fatal and schedule bounded restart", async () => {
  const child = new FakeChild();
  let restart: (() => void) | undefined;
  let delay = 0;
  let cleared = false;
  const manager = new WebSidecarManager(
    {
      enabled: true,
      port: 5174,
      workspace: "/workspace",
      scriptPath: "/web.js",
    },
    {
      spawn() {
        return child as never;
      },
      setTimeout(callback: () => void, milliseconds: number) {
        restart = callback;
        delay = milliseconds;
        return { unref() {} } as never;
      },
      clearTimeout() {
        cleared = true;
      },
    },
  );
  manager.start();
  child.emit("spawn");
  child.exitCode = 1;
  child.emit("exit", 1, null);
  assert.equal(manager.health().status, "failed");
  assert.equal(manager.health().restartCount, 1);
  assert.equal(delay, 500);
  assert.ok(restart);
  await manager.stop();
  assert.equal(cleared, true);
});
