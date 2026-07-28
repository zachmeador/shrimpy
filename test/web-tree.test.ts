import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodeNodeId } from "../dist/web/server/ids.js";
import { readNode } from "../dist/web/server/nodes.js";
import { readJsonl, readText } from "../dist/web/server/read.js";
import { buildTree } from "../dist/web/server/tree.js";
import {
  classifyWorkspaceFile,
  resolveAgents,
  resolveContainedFile,
} from "../dist/web/server/workspace.js";

async function fixture(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-"));
  const sessions = join(
    workspace,
    "agents",
    "shrimpy",
    "sessions",
    "channel",
    "aG9tZQ",
  );
  const session = join(sessions, "ZGVmYXVsdA");
  const researchSession = join(sessions, "cmVzZWFyY2g");
  await Promise.all([
    mkdir(join(workspace, "context"), { recursive: true }),
    mkdir(join(workspace, "context", "guides"), { recursive: true }),
    mkdir(join(workspace, "skills", "remember", "references"), { recursive: true }),
    mkdir(join(workspace, "config"), { recursive: true }),
    mkdir(join(workspace, "channels"), { recursive: true }),
    mkdir(join(workspace, "state", "pi"), { recursive: true }),
    mkdir(join(workspace, "runtime", "logs"), { recursive: true }),
    mkdir(join(workspace, "agents", "shrimpy", "vault"), { recursive: true }),
    mkdir(join(workspace, "agents", "shrimpy", "context", "nested"), { recursive: true }),
    mkdir(
      join(workspace, "agents", "shrimpy", "skills", "agent-tool", "references"),
      { recursive: true },
    ),
    mkdir(
      join(workspace, "agents", "shrimpy", "skills", "agent-tool", "scripts"),
      { recursive: true },
    ),
    mkdir(session, { recursive: true }),
    mkdir(researchSession, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(workspace, "context", "SYSTEM.md"), "# System\n"),
    writeFile(join(workspace, "context", "guides", "routing.md"), "# Routing\n"),
    writeFile(
      join(workspace, "skills", "remember", "SKILL.md"),
      "---\nname: remember\ndescription: Remember things.\n---\n",
    ),
    writeFile(
      join(workspace, "skills", "remember", "references", "format.md"),
      "# Format\n",
    ),
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
    writeFile(join(workspace, "agents", "shrimpy", "SOUL.md"), "# Soul\n"),
    writeFile(
      join(workspace, "agents", "shrimpy", "context", "scope.md"),
      "# Scope\n",
    ),
    writeFile(
      join(workspace, "agents", "shrimpy", "context", "nested", "detail.md"),
      "# Detail\n",
    ),
    writeFile(
      join(workspace, "agents", "shrimpy", "skills", "agent-tool", "SKILL.md"),
      "---\nname: agent-tool\ndescription: Agent tool.\n---\n",
    ),
    writeFile(
      join(
        workspace,
        "agents",
        "shrimpy",
        "skills",
        "agent-tool",
        "references",
        "notes.md",
      ),
      "# Notes\n",
    ),
    writeFile(
      join(
        workspace,
        "agents",
        "shrimpy",
        "skills",
        "agent-tool",
        "scripts",
        "inspect.sh",
      ),
      "#!/bin/sh\n",
    ),
    writeFile(
      join(workspace, "agents", "shrimpy", "skills", "agent-tool", ".env"),
      "TOKEN=nope\n",
    ),
    writeFile(
      join(workspace, "agents", "shrimpy", "vault", "private.md"),
      "# Private\n",
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
        customType: "shrimpy_lifecycle",
        data: { state: "active" },
      }),
      "",
    ].join("\n")),
    writeFile(join(session, "archived.jsonl"), [
      JSON.stringify({ type: "session", id: "archived" }),
      JSON.stringify({
        type: "custom",
        customType: "shrimpy_lifecycle",
        data: { state: "archived" },
      }),
      "",
    ].join("\n")),
    writeFile(join(researchSession, "session.json"), JSON.stringify({
      version: 1,
      key: {
        agentId: "shrimpy",
        namespace: "channel",
        name: "home",
        profileId: "research",
      },
      purpose: "interactive",
      delivery: { kind: "channel", channel: "home" },
    })),
    writeFile(join(researchSession, "turn.jsonl"), [
      JSON.stringify({ type: "session", id: "research" }),
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
    ["Overview", "Context", "Skills", "Channels", "Agents", "Runtime", "Workspace"],
  );

  const context = tree.root.children[1];
  assert.equal(context?.type, "directory");
  if (context?.type === "directory") {
    assert.deepEqual(
      context.children.map((node) => node.name),
      ["guides", "SYSTEM.md"],
    );
  }

  const skills = tree.root.children[2];
  assert.equal(skills?.type, "directory");
  if (skills?.type === "directory") {
    const remember = skills.children[0];
    assert.equal(remember?.type, "directory");
    if (remember?.type === "directory") {
      assert.deepEqual(
        remember.children.map((node) => node.name),
        ["SKILL.md", "references"],
      );
    }
  }

  const channels = tree.root.children[3];
  assert.equal(channels?.type, "directory");
  assert.equal(channels?.children[0]?.name, "home");
  assert.equal(channels?.children[1]?.name, "ops");
  assert.equal(channels?.children[0]?.type, "file");
  if (channels?.children[0]?.type === "file") {
    assert.equal(channels.children[0].kind, "channel");
    assert.doesNotMatch(channels.children[0].id, /channels|home/);
  }

  const agents = tree.root.children[4];
  assert.equal(agents?.type, "directory");
  if (agents?.type === "directory") {
    const shrimpy = agents.children[0];
    assert.equal(shrimpy?.name, "shrimpy");
    assert.equal(shrimpy?.type, "directory");
    if (shrimpy?.type === "directory") {
      assert.deepEqual(
        shrimpy.children.map((node) => node.name),
        ["Summary", "Context", "Skills", "Sessions", "Watches"],
      );
      const agentContext = shrimpy.children[1];
      assert.equal(agentContext?.type, "directory");
      if (agentContext?.type === "directory") {
        assert.deepEqual(
          agentContext.children.map((node) => node.name),
          ["SOUL.md", "nested", "scope.md"],
        );
      }
      const agentSkills = shrimpy.children[2];
      assert.equal(agentSkills?.type, "directory");
      if (agentSkills?.type === "directory") {
        assert.doesNotMatch(JSON.stringify(agentSkills), /\.env|TOKEN/);
        assert.match(JSON.stringify(agentSkills), /SKILL\.md/);
        assert.match(JSON.stringify(agentSkills), /notes\.md/);
        assert.match(JSON.stringify(agentSkills), /inspect\.sh/);
      }
    }
    assert.match(JSON.stringify(shrimpy), /home/);
    assert.doesNotMatch(JSON.stringify(shrimpy), /channel ·|default|active/);
    assert.match(JSON.stringify(shrimpy), /archived/);
    assert.match(JSON.stringify(shrimpy), /research/);
    assert.match(JSON.stringify(shrimpy), /Watches/);
  }

  const physical = tree.root.children[6];
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

  const session = await readNode(
    workspace,
    encodeNodeId({
      type: "session",
      agentId: "shrimpy",
      namespace: "channel",
      nameDirectory: "aG9tZQ",
      profileDirectory: "ZGVmYXVsdA",
      file: "turn.jsonl",
    }),
  );
  assert.equal(session.mode, "jsonl");
  assert.equal(session.label, "home");
  assert.deepEqual(session.metadata, [
    { label: "agent", value: "shrimpy" },
    { label: "namespace", value: "channel" },
    { label: "profile", value: "default" },
  ]);
  assert.match(session.sourcePath ?? "", /aG9tZQ\/ZGVmYXVsdA\/turn\.jsonl$/);
  assert.equal(typeof session.mtimeMs, "number");

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

  const workspaceSkill = await readNode(
    workspace,
    encodeNodeId({
      type: "file",
      path: "skills/remember/references/format.md",
    }),
  );
  assert.equal(workspaceSkill.mode, "text");
  if (workspaceSkill.mode === "text") {
    assert.equal(workspaceSkill.text, "# Format\n");
  }

  const agentContext = await readNode(
    workspace,
    encodeNodeId({
      type: "agent-file",
      agentId: "shrimpy",
      path: "context/nested/detail.md",
    }),
  );
  assert.equal(agentContext.mode, "text");
  assert.equal(agentContext.label, "detail.md");
  assert.deepEqual(agentContext.metadata, [
    { label: "agent", value: "shrimpy" },
    { label: "path", value: "shrimpy/context/nested/detail.md" },
  ]);
  if (agentContext.mode === "text") {
    assert.equal(agentContext.text, "# Detail\n");
  }

  const soul = await readNode(
    workspace,
    encodeNodeId({
      type: "agent-file",
      agentId: "shrimpy",
      path: "SOUL.md",
    }),
  );
  assert.equal(soul.mode, "text");
  if (soul.mode === "text") assert.equal(soul.text, "# Soul\n");

  const agentSkillScript = await readNode(
    workspace,
    encodeNodeId({
      type: "agent-file",
      agentId: "shrimpy",
      path: "skills/agent-tool/scripts/inspect.sh",
    }),
  );
  assert.equal(agentSkillScript.kind, "script");
  assert.equal(agentSkillScript.mode, "text");
  if (agentSkillScript.mode === "text") {
    assert.equal(agentSkillScript.text, "#!/bin/sh\n");
  }

  for (const path of [
    "vault/private.md",
    "context/../vault/private.md",
    "skills/agent-tool/.env",
  ]) {
    await assert.rejects(
      readNode(
        workspace,
        encodeNodeId({
          type: "agent-file",
          agentId: "shrimpy",
          path,
        }),
      ),
      /not exposed|not readable/,
    );
  }

  await assert.rejects(
    readNode(
      workspace,
      encodeNodeId({
        type: "file",
        path: "context/../config/shrimpy.json",
      }),
    ),
    /not readable/,
  );
});

test("bounded JSONL reads support byte cursors", async () => {
  const workspace = await fixture();
  const path = join(workspace, "channels", "home.jsonl");
  const first = await readJsonl(path);
  await writeFile(path, "{\"text\":\"one\"}\n{\"text\":\"two\"}\n");
  const appended = await readJsonl(path, first.cursor, first.anchor);
  assert.equal(appended.replace, false);
  assert.equal(appended.truncated, false);
  assert.deepEqual(appended.events, [{ text: "two" }]);

  await writeFile(path, "{\"text\":\"new\"}\n{\"text\":\"shape\"}\n");
  const replaced = await readJsonl(path, appended.cursor, appended.anchor);
  assert.equal(replaced.replace, true);
  assert.deepEqual(replaced.events, [{ text: "new" }, { text: "shape" }]);

  const text = await readText(join(workspace, "context", "SYSTEM.md"));
  assert.equal(text.text, "# System\n");
  assert.equal(text.truncated, false);
});

test("scoped file ids survive edits while additions and removals reshape the tree", async () => {
  const workspace = await fixture();
  const first = await buildTree(workspace);
  const context = first.root.children.find((node) => node.name === "Context");
  assert.equal(context?.type, "directory");
  if (context?.type !== "directory") return;
  const system = context.children.find((node) => node.name === "SYSTEM.md");
  assert.equal(system?.type, "file");
  if (system?.type !== "file") return;

  await writeFile(join(workspace, "context", "SYSTEM.md"), "# Updated\n");
  await writeFile(join(workspace, "context", "added.md"), "# Added\n");
  const updated = await buildTree(workspace);
  const updatedContext = updated.root.children.find(
    (node) => node.name === "Context",
  );
  assert.equal(updatedContext?.type, "directory");
  if (updatedContext?.type !== "directory") return;
  assert.equal(
    updatedContext.children.find((node) => node.name === "SYSTEM.md")?.id,
    system.id,
  );
  assert.equal(
    updatedContext.children.some((node) => node.name === "added.md"),
    true,
  );
  const selected = await readNode(workspace, system.id);
  assert.equal(selected.mode, "text");
  if (selected.mode === "text") assert.equal(selected.text, "# Updated\n");

  await unlink(join(workspace, "context", "added.md"));
  const removed = await buildTree(workspace);
  const removedContext = removed.root.children.find(
    (node) => node.name === "Context",
  );
  assert.equal(removedContext?.type, "directory");
  if (removedContext?.type === "directory") {
    assert.equal(
      removedContext.children.some((node) => node.name === "added.md"),
      false,
    );
  }
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
  await symlink(
    join(outside, "secret.txt"),
    join(workspace, "agents", "shrimpy", "context", "escape.md"),
  );
  const tree = await buildTree(workspace);
  assert.doesNotMatch(JSON.stringify(tree.root.children[4]), /escape\.md/);
  await assert.rejects(
    readNode(
      workspace,
      encodeNodeId({
        type: "agent-file",
        agentId: "shrimpy",
        path: "context/escape.md",
      }),
    ),
    /no longer exists/,
  );
});

test("web agent discovery keeps roots inside the workspace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-agents-"));
  const outside = await mkdtemp(join(tmpdir(), "shrimpy-web-agent-outside-"));
  await mkdir(join(workspace, "config"), { recursive: true });
  await mkdir(join(workspace, "agent-roots", "inside"), { recursive: true });
  await symlink(outside, join(workspace, "agents-external-link"));
  await writeFile(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify({
      agents: [
        { id: "inside", root: "agent-roots/inside" },
        { id: "absolute", root: outside },
        { id: "escape", root: "../outside" },
        { id: "symlink", root: "agents-external-link" },
      ],
    }),
  );

  assert.deepEqual(
    resolveAgents(workspace).map((agent) => agent.id),
    ["inside"],
  );
});
