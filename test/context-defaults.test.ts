import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assemblePromptContext,
  assembleBasePromptSections,
  assembleContextViewSections,
  buildSystemEnvSections,
  renderPromptSections,
  resolveContextEnvKeys,
  resolveContextConfig,
  resolveContextDefaultsConfig,
} from "../dist/context/index.js";

describe("assemblePromptContext", () => {
  test("orders prompt sections by Foundation, Vault, then Situation", () => {
    const context = assemblePromptContext({
      sections: [
        {
          id: "capability:skill",
          title: "Skill",
          kind: "capability",
          source: "test",
          reason: "test",
          content: "# SKILL",
        },
        {
          id: "session:env",
          title: "Runtime",
          kind: "runtime",
          source: "test",
          reason: "test",
          content: "# RUNTIME",
        },
        {
          id: "base:identity",
          title: "Identity",
          kind: "identity",
          source: "test",
          reason: "test",
          content: "# IDENTITY",
        },
      ],
    });

    assert.deepEqual(context.sections.map((section) => section.id), [
      "base:identity",
      "capability:skill",
      "session:env",
    ]);
    assert.match(
      context.systemPrompt,
      /^\[context base:identity identity\]\n\n# IDENTITY\n\n---\n\n\[context capability:skill capability\]\n\n# SKILL\n\n---\n\n\[context session:env runtime\]\n\n# RUNTIME$/,
    );
  });
});

describe("resolveContextDefaultsConfig", () => {
  test("returns built-in defaults when omitted", () => {
    const defaults = resolveContextDefaultsConfig();
    assert.deepEqual(defaults, {
      sources: [
        "workspace:profile/WORKSPACE.md",
        "workspace:profile/SYSTEM.md",
        "agent:SOUL.md",
        "workspace:profile/USER.md",
        "agent:context/",
      ],
      env: [
        "workspace_path",
        "shrimpy_version",
        "hostname",
        "timezone",
        "session_type",
        "channel",
        "session_dir",
      ],
    });
  });

  test("rejects unknown env keys", () => {
    assert.throws(
      () =>
        resolveContextDefaultsConfig({
          env: ["not_a_real_env_key"],
        }),
      /unknown env key in contextDefaults\.env/,
    );
  });

  test("rejects invalid resource addresses", () => {
    assert.throws(
      () =>
        resolveContextDefaultsConfig({
          sources: ["SOUL.md"],
        }),
      /contextDefaults\.sources\[0\] must start with "workspace:" or "agent:"/,
    );
  });

  test("keeps model identity out of rendered runtime environment", () => {
    const sections = buildSystemEnvSections({
      sessionType: "preview",
      envKeys: ["workspace_path", "model_id", "provider"],
      env: {
        workspace_path: "/tmp/shrimpy",
        model_id: "gpt-test",
        provider: "test-provider",
      },
    });

    assert.equal(sections.length, 1);
    assert.match(sections[0]!.content, /\*\*workspace_path\*\*/);
    assert.doesNotMatch(sections[0]!.content, /\*\*model_id\*\*/);
    assert.doesNotMatch(sections[0]!.content, /\*\*provider\*\*/);
  });

  test("adds direct-session delivery guidance for TUI sessions", () => {
    const sections = buildSystemEnvSections({
      sessionType: "tui",
      envKeys: [],
      env: {},
    });

    assert.equal(sections.length, 1);
    assert.equal(sections[0]!.id, "session:direct_delivery");
    assert.match(sections[0]!.content, /ordinary assistant text/);
    assert.match(sections[0]!.content, /Do not use reply\(text\)/);
    assert.match(sections[0]!.content, /only when explicitly asked/);
    assert.match(sections[0]!.content, /Agent DMs are internal channels/);
  });

  test("adds publication guidance for gateway channel sessions", () => {
    const sections = buildSystemEnvSections({
      sessionType: "gateway",
      channel: "telegram-123",
      envKeys: [],
      env: {},
    });

    assert.equal(sections.length, 1);
    assert.equal(sections[0]!.id, "session:delivery");
    assert.match(sections[0]!.content, /Plain assistant text stays/);
    assert.match(sections[0]!.content, /no external adapter is expected/);
    assert.match(sections[0]!.content, /normally completes your response/);
  });
});

describe("resolveContextConfig", () => {
  test("uses contextDefaults when context is omitted", () => {
    const resolved = resolveContextConfig(
      undefined,
      {
        sources: [
          "agent:SOUL.md",
          "agent:context/",
        ],
        env: ["workspace_path", "channel"],
      },
    );

    assert.deepEqual(resolved, {
      sources: [
        "agent:SOUL.md",
        "agent:context/",
      ],
      env: ["workspace_path", "channel"],
      channels: {},
      agents: {},
      turn: defaultTurnContextConfig(),
    });
  });

  test("context values override defaults while preserving fallback fields", () => {
    const resolved = resolveContextConfig(
      {
        sources: ["workspace:profile/USER.md"],
      },
      {
        sources: [
          "agent:SOUL.md",
          "workspace:profile/SYSTEM.md",
        ],
        env: ["workspace_path"],
      },
    );

    assert.deepEqual(resolved, {
      sources: ["workspace:profile/USER.md"],
      env: ["workspace_path"],
      channels: {},
      agents: {},
      turn: defaultTurnContextConfig(),
    });
  });

  test("supports ordered workspace and agent resources", () => {
    const resolved = resolveContextConfig(
      {
        sources: [
          "workspace:profile/WORKSPACE.md",
          "agent:SOUL.md",
        ],
      },
      {
        sources: [
          "workspace:HOME.md",
          "workspace:profile/SYSTEM.md",
        ],
        env: ["workspace_path"],
      },
    );

    assert.deepEqual(resolved, {
      sources: [
        "workspace:profile/WORKSPACE.md",
        "agent:SOUL.md",
      ],
      env: ["workspace_path"],
      channels: {},
      agents: {},
      turn: defaultTurnContextConfig(),
    });
  });

  test("rejects unknown env keys in channel overrides", () => {
    assert.throws(
      () =>
        resolveContextConfig({
          channels: {
            maintenance: {
              env: ["not_a_real_env_key"],
            },
          },
        }),
      /unknown env key in context\.channels\["maintenance"\]\.env/,
    );
  });
});

function defaultTurnContextConfig() {
  return {
    maxChars: 2000,
    channelUnread: {
      enabled: true,
      channels: ["*"],
      includeLatest: true,
    },
    sessionStatus: {
      enabled: true,
      staleAfterMinutes: 720,
    },
  };
}

describe("assembleContextViewSections", () => {
  test("renders only channel-scoped resources in the stable session context", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-session-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "profile"), { recursive: true });

    try {
      writeFileSync(join(agentRoot, "MAINTENANCE.md"), "# MAINTENANCE\n\nsteady\n", "utf-8");

      const ctx = resolveContextConfig({
        env: ["workspace_path", "channel", "model_id"],
        channels: {
          maintenance: {
            sources: ["agent:MAINTENANCE.md"],
            env: ["workspace_path", "channel"],
          },
        },
      });

      const rendered = renderPromptSections(assembleContextViewSections(
        agentRoot,
        workspace,
        ctx,
        "maintenance",
      ));

      assert.match(rendered, /# MAINTENANCE/);
      assert.doesNotMatch(rendered, /\*\*workspace_path\*\*/);
      assert.deepEqual(resolveContextEnvKeys(ctx, "maintenance"), [
        "workspace_path",
        "channel",
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("represents channel-scoped resources as context sections", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-session-section-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "profile"), { recursive: true });

    try {
      writeFileSync(join(workspace, "NOTICE.md"), "# NOTICE\n\nworkspace\n", "utf-8");
      writeFileSync(join(agentRoot, "MAINTENANCE.md"), "# MAINTENANCE\n\nsteady\n", "utf-8");

      const sections = assembleContextViewSections(
        agentRoot,
        workspace,
        resolveContextConfig({
          channels: {
            maintenance: {
              sources: ["workspace:NOTICE.md", "agent:MAINTENANCE.md"],
            },
          },
        }),
        "maintenance",
      );

      assert.equal(sections.length, 2);
      assert.deepEqual(sections.map((section) => section.id), [
        "channel:NOTICE.md",
        "channel:MAINTENANCE.md",
      ]);
      assert.deepEqual(sections.map((section) => section.kind), [
        "identity",
        "identity",
      ]);
      assert.match(sections[0].reason, /maintenance/);
      assert.match(sections[0].content, /workspace/);
      assert.match(sections[1].content, /steady/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("assembleBasePromptSections", () => {
  test("renders resources in configured order", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-base-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "profile"), { recursive: true });

    try {
      writeFileSync(join(workspace, "profile", "WORKSPACE.md"), "# WORKSPACE\n\nroot\n", "utf-8");
      writeFileSync(join(agentRoot, "SOUL.md"), "# SOUL\n\nagent\n", "utf-8");

      const rendered = renderPromptSections(assembleBasePromptSections(
        agentRoot,
        workspace,
        resolveContextConfig({
          sources: [
            "workspace:profile/WORKSPACE.md",
            "agent:SOUL.md",
          ],
        }),
      ));

      assert.match(rendered, /^\[context base:profile\/WORKSPACE\.md identity\]\n\n# WORKSPACE/);
      assert.match(rendered, /# SOUL/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("represents configured resources as ordered context sections", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-base-section-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "profile"), { recursive: true });

    try {
      writeFileSync(join(workspace, "profile", "WORKSPACE.md"), "# WORKSPACE\n\nroot\n", "utf-8");
      mkdirSync(join(agentRoot, "context"), { recursive: true });
      writeFileSync(join(agentRoot, "context", "identity.md"), "# IDENTITY\n\nagent\n", "utf-8");

      const sections = assembleBasePromptSections(agentRoot, workspace, resolveContextConfig({
        sources: [
          "workspace:profile/WORKSPACE.md",
          "agent:context/",
        ],
      }));

      assert.deepEqual(sections.map((section) => section.id), [
        "base:profile/WORKSPACE.md",
        "base:context/identity.md",
      ]);
      assert.deepEqual(sections.map((section) => section.kind), [
        "identity",
        "memory",
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("supports skill-root resources through the same assembly path", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-skill-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    const skillRoot = join(agentRoot, "skills", "setup");
    mkdirSync(skillRoot, { recursive: true });

    try {
      writeFileSync(join(skillRoot, "SKILL.md"), "# SKILL\n\nsetup\n", "utf-8");

      const rendered = renderPromptSections(assembleBasePromptSections(
        agentRoot,
        workspace,
        resolveContextConfig(),
        {
          extraResources: [{
            rootPath: agentRoot,
            resourcePath: "skills/setup",
          }],
        },
      ));

      assert.match(rendered, /# SKILL/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
