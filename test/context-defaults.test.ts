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
  buildRuntimeEnvironmentSection,
  buildSessionDeliverySection,
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
          path: "skill",
          title: "Skill",
          kind: "capability",
          source: "test",
          reason: "test",
          content: "# SKILL",
        },
        {
          id: "session:env",
          path: "runtime/env",
          title: "Runtime",
          kind: "runtime",
          source: "test",
          reason: "test",
          content: "# RUNTIME",
        },
        {
          id: "base:identity",
          path: "identity",
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
      /^<context path="identity">\n# IDENTITY\n<\/context>\n\n<context path="skill">\n# SKILL\n<\/context>\n\n<context path="runtime\/env">\n# RUNTIME\n<\/context>$/,
    );
  });
});

describe("resolveContextDefaultsConfig", () => {
  test("returns built-in defaults when omitted", () => {
    const defaults = resolveContextDefaultsConfig();
    assert.deepEqual(defaults, {
      sources: [
        "workspace:context/",
        "agent:SOUL.md",
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
    const section = buildRuntimeEnvironmentSection({
      envKeys: ["workspace_path", "model_id", "provider"],
      env: {
        workspace_path: "/tmp/shrimpy",
        model_id: "gpt-test",
        provider: "test-provider",
      },
    });

    assert.equal(section?.id, "session:runtime_environment");
    assert.match(section!.content, /\*\*workspace_path\*\*/);
    assert.doesNotMatch(section!.content, /\*\*model_id\*\*/);
    assert.doesNotMatch(section!.content, /\*\*provider\*\*/);
  });

  test("renders boot timestamp as session boot time", () => {
    const section = buildRuntimeEnvironmentSection({
      envKeys: ["booted_at_iso"],
      env: {
        booted_at_iso: "2026-05-20T04:02:19.469Z",
      },
    });

    assert.equal(section?.id, "session:runtime_environment");
    assert.match(section!.content, /\*\*session_booted_at_utc\*\*: 2026-05-20T04:02:19\.469Z/);
    assert.doesNotMatch(section!.content, /booted_at_iso/);
  });

  test("adds direct-session delivery guidance for TUI sessions", () => {
    const section = buildSessionDeliverySection({
      sessionType: "tui",
    });

    assert.equal(section?.id, "session:direct_delivery");
    assert.match(section!.content, /ordinary assistant text/);
    assert.match(section!.content, /Do not use reply\(text\)/);
    assert.match(section!.content, /only when explicitly asked/);
    assert.match(section!.content, /Agent DMs are internal channels/);
  });

  test("adds publication guidance for gateway channel sessions", () => {
    const section = buildSessionDeliverySection({
      sessionType: "gateway",
      channel: "telegram-123",
    });

    assert.equal(section?.id, "session:delivery");
    assert.match(section!.content, /Plain assistant text is private/);
    assert.match(section!.content, /Use reply\(text\) for a normal user-visible response/);
    assert.match(section!.content, /only for explicit routing/);
    assert.match(section!.content, /no external adapter by default/);
    assert.match(section!.content, /do not duplicate the message/);
    assert.doesNotMatch(section!.content, /exactly one/);
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
        sources: ["workspace:context/user.md"],
      },
      {
        sources: [
          "agent:SOUL.md",
          "workspace:context/",
        ],
        env: ["workspace_path"],
      },
    );

    assert.deepEqual(resolved, {
      sources: ["workspace:context/user.md"],
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
          "workspace:context/",
          "agent:SOUL.md",
        ],
      },
      {
        sources: [
          "workspace:HOME.md",
          "workspace:context/extra.md",
        ],
        env: ["workspace_path"],
      },
    );

    assert.deepEqual(resolved, {
      sources: [
        "workspace:context/",
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
    mkdirSync(join(workspace, "context"), { recursive: true });

    try {
      writeFileSync(join(workspace, "context", "SYSTEM.md"), "# SYSTEM\n\nroot\n", "utf-8");
      writeFileSync(join(agentRoot, "SOUL.md"), "# SOUL\n\nagent\n", "utf-8");

      const rendered = renderPromptSections(assembleBasePromptSections(
        agentRoot,
        workspace,
        resolveContextConfig({
          sources: [
            "workspace:context/",
            "agent:SOUL.md",
          ],
        }),
      ));

      assert.ok(rendered.startsWith(
        `<context path="${join(workspace, "context", "SYSTEM.md")}">\n# SYSTEM`,
      ));
      assert.match(rendered, /# SOUL/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("represents configured resources as ordered context sections", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-base-section-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "context"), { recursive: true });

    try {
      writeFileSync(join(workspace, "context", "SYSTEM.md"), "# SYSTEM\n\nroot\n", "utf-8");
      writeFileSync(join(workspace, "context", "USER.md"), "# USER\n\nowner\n", "utf-8");
      writeFileSync(join(workspace, "context", "WORKSPACE.md"), "# WORKSPACE\n\nenv\n", "utf-8");
      mkdirSync(join(agentRoot, "context"), { recursive: true });
      writeFileSync(join(agentRoot, "context", "memory.md"), "# MEMORY\n\nagent\n", "utf-8");
      mkdirSync(join(agentRoot, "context", "people"), { recursive: true });
      writeFileSync(join(agentRoot, "context", "people", "human-alice.md"), "# ALICE\n\nperson\n", "utf-8");

      const sections = assembleBasePromptSections(agentRoot, workspace, resolveContextConfig({
        sources: [
          "workspace:context/",
          "agent:context/",
        ],
      }));

      assert.deepEqual(sections.map((section) => section.id), [
        "base:context/SYSTEM.md",
        "base:context/USER.md",
        "base:context/WORKSPACE.md",
        "base:context/memory.md",
        "base:context/people/human-alice.md",
      ]);
      assert.deepEqual(sections.map((section) => section.kind), [
        "identity",
        "identity",
        "identity",
        "memory",
        "memory",
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("supports skill-root resources through the same assembly path", () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-skill-test-"));
    const agentRoot = join(workspace, "agents", "shrimpy");
    const skillRoot = join(agentRoot, "skills", "shrimpy-setup");
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
            resourcePath: "skills/shrimpy-setup",
          }],
        },
      ));

      assert.match(rendered, /# SKILL/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
