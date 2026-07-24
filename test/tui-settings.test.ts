import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initTheme, type InteractiveMode } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../dist/app/runtime.js";
import {
  installShrimpySettingsSelector,
  type ShrimpySettingsSelectorOptions,
} from "../dist/tui/settings.js";

test("/settings preserves the Shrimpy/Pi landing page", () => {
  initTheme("dark", false);
  const workspace = createWorkspace();
  const runtime = createAppRuntime({ workspace } as never);
  const quietWas = runtime.resolved.runtime.quietStartup;
  let selectorFactory: SelectorFactory | undefined;
  let piSettingsOpened = 0;
  const notifications: Array<{ message: string; type?: string }> = [];
  const session = createSession();

  const interactive = {
    showSelector(create: SelectorFactory): void {
      selectorFactory = create;
    },
    showSettingsSelector(): void {
      piSettingsOpened += 1;
      this.showSelector((done: () => void) => ({
        component: component("Pi original settings"),
        focus: component("Pi original settings"),
        done,
      }));
    },
  } as unknown as InteractiveMode & { showSettingsSelector(): void };

  installShrimpySettingsSelector(interactive, {
    runtime,
    agentId: "shrimpy",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: workspace,
    getSession: () => session as never,
    ui: {
      extensionFactory: (() => {}) as never,
      notify(message: string, type?: "info" | "warning" | "error"): void {
        notifications.push({ message, type });
      },
    },
  } satisfies ShrimpySettingsSelectorOptions);

  interactive.showSettingsSelector();
  let rendered = openSelector(selectorFactory!);
  assert.match(rendered.text, /Shrimpy settings/);
  assert.match(rendered.text, /Pi settings/);

  rendered.focus.handleInput("\r");
  rendered = openSelector(selectorFactory!);
  assert.match(rendered.text, /Workspace/);
  assert.match(rendered.text, /Model/);
  assert.match(rendered.text, /Thinking/);
  assert.match(rendered.text, /Tool policy/);
  assert.match(rendered.text, /Channel policy/);
  assert.match(rendered.text, /Compaction window/);
  for (let index = 0; index < 10; index += 1) {
    rendered.focus.handleInput("\x1b[B");
  }
  assert.match(rendered.focus.render(100).join("\n"), /Auto-compact/);
  rendered.focus.handleInput("\r");
  assert.equal(session.autoCompactionEnabled, false);
  assert.deepEqual(session.autoCompactionChanges, [false]);
  assert.deepEqual(notifications, [{ message: "Shrimpy auto-compact: off", type: undefined }]);
  const persisted = JSON.parse(
    readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
  ) as { runtime?: { compaction?: { enabled?: boolean } } };
  assert.equal(persisted.runtime?.compaction?.enabled, false);
  rendered.focus.handleInput("\x1b[B");
  rendered.focus.handleInput("\x1b[B");
  rendered.focus.handleInput("\r");
  assert.deepEqual(session.quietStartupChanges, [!quietWas]);
  const afterQuiet = JSON.parse(
    readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
  ) as { runtime?: { quietStartup?: boolean } };
  assert.equal(afterQuiet.runtime?.quietStartup, !quietWas);
  assert.deepEqual(notifications, [
    { message: "Shrimpy auto-compact: off", type: undefined },
    {
      message: `Shrimpy quiet startup: ${quietWas ? "off" : "on"}`,
      type: undefined,
    },
  ]);
  rendered.done();

  rendered = openSelector(selectorFactory!);
  rendered.focus.handleInput("\x1b[B");
  rendered.focus.handleInput("\r");
  rendered = openSelector(selectorFactory!);
  assert.equal(piSettingsOpened, 1);
  assert.match(rendered.text, /Pi original settings/);

  rendered.done();
  rendered = openSelector(selectorFactory!);
  assert.match(rendered.text, /Shrimpy settings/);
  assert.match(rendered.text, /Pi settings/);
});

type SelectorFactory = (done: () => void) => {
  component: TestComponent;
  focus: TestComponent;
  done?: () => void;
};

interface TestComponent {
  render(width: number): string[];
  handleInput(data: string): void;
}

function openSelector(factory: SelectorFactory) {
  const opened = factory(() => {});
  return {
    text: opened.component.render(100).join("\n"),
    focus: opened.focus,
    done: opened.done ?? (() => {
      opened.focus.handleInput("\x1b");
    }),
  };
}

function component(text: string): TestComponent {
  return {
    render(): string[] {
      return [text];
    },
    handleInput(): void {},
  };
}

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-tui-settings-"));
  mkdirSync(join(workspace, "config"), { recursive: true });
  writeFileSync(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify({ workspace }),
  );
  return workspace;
}

function createSession() {
  const quietStartupChanges: boolean[] = [];
  return {
    model: { provider: "test", id: "reasoning-model" },
    thinkingLevel: "high",
    autoCompactionEnabled: true,
    autoCompactionChanges: [] as boolean[],
    quietStartupChanges,
    getActiveToolNames(): string[] {
      return ["read", "send_message"];
    },
    getAllTools(): Array<{ name: string }> {
      return [{ name: "read" }, { name: "send_message" }, { name: "write" }];
    },
    setAutoCompactionEnabled(enabled: boolean): void {
      this.autoCompactionEnabled = enabled;
      this.autoCompactionChanges.push(enabled);
    },
    settingsManager: {
      setQuietStartup(enabled: boolean): void {
        quietStartupChanges.push(enabled);
      },
    },
  };
}
