import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodeNodeId } from "../dist/web/server/ids.js";
import { readNode } from "../dist/web/server/nodes.js";
import { readJsonl, readText } from "../dist/web/server/read.js";
import { buildTree } from "../dist/web/server/tree.js";
import {
  classifyWorkspaceFile,
  resolveContainedFile,
} from "../dist/web/server/workspace.js";

async function fixture(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-"));
  const session = join(
    workspace,
    "agents",
    "shrimpy",
    "sessions",
    "channel",
    "aG9tZQ",
    "ZGVmYXVsdA",
  );
  await Promise.all([
    mkdir(join(workspace, "context"), { recursive: true }),
    mkdir(join(workspace, "config"), { recursive: true }),
    mkdir(join(workspace, "channels"), { recursive: true }),
    mkdir(join(workspace, "state", "pi"), { recursive: true }),
    mkdir(join(workspace, "runtime", "logs"), { recursive: true }),
    mkdir(join(workspace, "agents", "shrimpy", "vault"), { recursive: true }),
    mkdir(session, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(workspace, "context", "SYSTEM.md"), "# System\n"),
    writeFile(join(workspace, "config", "shrimpy.json"), "{}\n"),
    writeFile(join(workspace, "config", "channels.json"), JSON.stringify({
      channels: {
        home: { agents: { shrimpy: {} } },
        ops: { agents: { shrimpy: {} } },
      },
    })),
    writeFile(join(workspace, "channels", "home.jsonl"), "{\"text\":\"one\"}\n"),
    writeFile(join(workspace, "state", "pi", "auth.json"), "{}\n"),
    writeFile(join(workspace, "state", "pi", "models-store.json"), "{}\n"),
    writeFile(join(workspace, "runtime", "logs", "gateway.log"), "started\n"),
    writeFile(
      join(workspace, "agents", "shrimpy", "watches.json"),
      JSON.stringify({ watches: [{ id: "pulse", enabled: true }] }),
    ),
    writeFile(join(session, "session.json"), JSON.stringify({
      version: 1,
      key: {
        agentId: "shrimpy",
        namespace: "channel",
        name: "home",
        profileId: "default",
      },
      purpose: "interactive",
      delivery: { kind: "channel", channel: "home" },
    })),
    writeFile(join(session, "turn.jsonl"), [
      JSON.stringify({ type: "session", id: "one" }),
      JSON.stringify({
        type: "custom",
        customType: "shrimpy_session_lifecycle",
        data: { state: "active" },
      }),
      "",
    ].join("\n")),
  ]);
  return workspace;
}

test("web tree combines useful menu nodes with the physical workspace", async () => {
  const workspace = await fixture();
  const tree = await buildTree(workspace);
  assert.deepEqual(
    tree.root.children.map((node) => node.name),
    ["Overview", "Channels", "Agents", "Runtime", "Workspace"],
  );

  const channels = tree.root.children[1];
  assert.equal(channels?.type, "directory");
  assert.equal(channels?.children[0]?.name, "home");
  assert.equal(channels?.children[1]?.name, "ops");
  assert.equal(channels?.children[0]?.type, "file");
  if (channels?.children[0]?.type === "file") {
    assert.equal(channels.children[0].kind, "channel");
    assert.doesNotMatch(channels.children[0].id, /channels|home/);
  }

  const agents = tree.root.children[2];
  assert.equal(agents?.type, "directory");
  if (agents?.type === "directory") {
    const shrimpy = agents.children[0];
    assert.equal(shrimpy?.name, "shrimpy");
    assert.match(JSON.stringify(shrimpy), /home/);
    assert.match(JSON.stringify(shrimpy), /channel · default · active/);
    assert.match(JSON.stringify(shrimpy), /Watches/);
  }

  const physical = tree.root.children[4];
  assert.equal(physical?.type, "directory");
  if (physical?.type === "directory") {
    const config = physical.children.find((node) => node.name === "config");
    assert.equal(config?.type, "directory");
    if (config?.type === "directory") {
      const secret = config.children.find((node) => node.name === "shrimpy.json");
      assert.equal(secret?.type, "file");
      if (secret?.type === "file") {
        assert.equal(secret.kind, "private");
        assert.equal(secret.readable, false);
      }
    }
  }
});

test("node readers expose structured current sessions and deny secrets", async () => {
  const workspace = await fixture();
  const channel = await readNode(
    workspace,
    encodeNodeId({ type: "channel", channel: "home" }),
  );
  assert.equal(channel.mode, "jsonl");
  if (channel.mode === "jsonl") {
    assert.equal(channel.events.length, 1);
    assert.equal(channel.replace, true);
  }

  const configuredOnly = await readNode(
    workspace,
    encodeNodeId({ type: "channel", channel: "ops" }),
  );
  assert.equal(configuredOnly.mode, "overview");

  await assert.rejects(
    readNode(
      workspace,
      encodeNodeId({ type: "file", path: "state/pi/auth.json" }),
    ),
    /not readable/,
  );
  assert.deepEqual(classifyWorkspaceFile("state/pi/models-store.json"), {
    kind: "private",
    readable: false,
  });
});

test("bounded JSONL reads support byte cursors", async () => {
  const workspace = await fixture();
  const path = join(workspace, "channels", "home.jsonl");
  const first = await readJsonl(path);
  await writeFile(path, "{\"text\":\"one\"}\n{\"text\":\"two\"}\n");
  const appended = await readJsonl(path, first.cursor, first.anchor);
  assert.equal(appended.replace, false);
  assert.deepEqual(appended.events, [{ text: "two" }]);

  await writeFile(path, "{\"text\":\"new\"}\n{\"text\":\"shape\"}\n");
  const replaced = await readJsonl(path, appended.cursor, appended.anchor);
  assert.equal(replaced.replace, true);
  assert.deepEqual(replaced.events, [{ text: "new" }, { text: "shape" }]);

  const text = await readText(join(workspace, "context", "SYSTEM.md"));
  assert.equal(text.text, "# System\n");
  assert.equal(text.truncated, false);
});

test("realpath containment rejects symlink escapes", async () => {
  const workspace = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "shrimpy-web-outside-"));
  await writeFile(join(outside, "secret.txt"), "nope\n");
  await symlink(join(outside, "secret.txt"), join(workspace, "context", "escape.txt"));
  assert.equal(
    await resolveContainedFile(workspace, "context/escape.txt"),
    null,
  );
});
