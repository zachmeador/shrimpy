import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { initTheme } from "@earendil-works/pi-coding-agent";
import shrimpyActivityIndicator, {
  SHRIMPY_WORKING_INDICATOR,
} from "../extensions/activity-indicator.ts";
import {
  createShrimpyFooterExtensionFactory,
  renderShrimpyActivityFooter,
} from "../dist/tui/footer.js";

test("Shrimpy activity indicator configures Pi's public TUI working indicator", () => {
  let sessionStart: SessionStartHandler | undefined;
  shrimpyActivityIndicator({
    on(event: string, handler: SessionStartHandler): void {
      assert.equal(event, "session_start");
      sessionStart = handler;
    },
  } as never);

  let configured: typeof SHRIMPY_WORKING_INDICATOR | undefined;
  sessionStart?.({}, {
    mode: "tui",
    ui: {
      setWorkingIndicator(options): void {
        configured = options;
      },
    },
  });

  assert.deepEqual(configured, SHRIMPY_WORKING_INDICATOR);
  assert.equal(configured?.intervalMs, 180);
  assert.equal(configured?.frames?.length, 4);
  assert.equal(configured?.frames?.every((frame) => visibleWidth(frame) === 4), true);
});

test("Shrimpy activity indicator leaves non-TUI sessions alone", () => {
  let sessionStart: SessionStartHandler | undefined;
  shrimpyActivityIndicator({
    on(_event: string, handler: SessionStartHandler): void {
      sessionStart = handler;
    },
  } as never);

  let configured = false;
  sessionStart?.({}, {
    mode: "print",
    ui: {
      setWorkingIndicator(): void {
        configured = true;
      },
    },
  });

  assert.equal(configured, false);
});

test("Shrimpy footer registers through Pi's public footer API", () => {
  let sessionStart: SessionStartHandler | undefined;
  createShrimpyFooterExtensionFactory(() => {
    throw new Error("session getter is lazy");
  })({
    on(_event: string, handler: SessionStartHandler): void {
      sessionStart = handler;
    },
  } as never);

  let footerFactory: unknown;
  sessionStart?.({}, {
    mode: "tui",
    ui: {
      setWorkingIndicator(): void {},
      setFooter(factory: unknown): void {
        footerFactory = factory;
      },
    },
  });

  assert.equal(typeof footerFactory, "function");
});

test("Shrimpy footer parks at bottom right when idle", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, false, 0), [
    "cwd",
    /^stats\s+🦐$/u,
  ]);
});

test("Shrimpy footer orbits its last two rows while streaming", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 1), [
    /^cwd\s+🦐$/u,
    "stats",
  ]);
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 2), [
    "cwd",
    /^stats\s+🦐$/u,
  ]);
});

test("Shrimpy footer stays busy during compaction and automatic retry", () => {
  initTheme("dark", false);
  const listeners = new Set<(event: { type: string }) => void>();
  const session = {
    isStreaming: false,
    autoCompactionEnabled: true,
    state: {
      model: {
        provider: "test",
        id: "model",
        reasoning: false,
        contextWindow: 1000,
      },
    },
    sessionManager: {
      getEntries: () => [],
      getCwd: () => "/tmp",
      getSessionName: () => undefined,
    },
    getContextUsage: () => ({ contextWindow: 1000, percent: 0 }),
    modelRegistry: { isUsingOAuth: () => false },
    subscribe(listener: (event: { type: string }) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  let footerFactory: ((tui: unknown, theme: unknown, data: unknown) => {
    render(width: number): string[];
    dispose(): void;
  }) | undefined;
  createShrimpyFooterExtensionFactory(() => session as never)({
    on(_event: string, handler: SessionStartHandler): void {
      handler({}, {
        mode: "tui",
        ui: {
          setWorkingIndicator(): void {},
          setFooter(factory: unknown): void {
            footerFactory = factory as typeof footerFactory;
          },
        },
      });
    },
  } as never);
  const footer = footerFactory!(
    { requestRender(): void {} },
    {},
    {
      getGitBranch: () => undefined,
      getAvailableProviderCount: () => 1,
      getExtensionStatuses: () => new Map(),
    },
  );

  assert.match(footer.render(30)[1]!.trimEnd(), /🦐$/u);
  emit("compaction_start");
  assert.match(footer.render(30)[0]!.trimEnd(), /🦐$/u);
  emit("compaction_end");
  assert.match(footer.render(30)[1]!.trimEnd(), /🦐$/u);
  emit("auto_retry_start");
  assert.match(footer.render(30)[0]!.trimEnd(), /🦐$/u);
  emit("auto_retry_end");
  assert.match(footer.render(30)[1]!.trimEnd(), /🦐$/u);
  footer.dispose();

  function emit(type: string): void {
    for (const listener of listeners) listener({ type });
  }
});

interface SessionStartHandler {
  (
    event: unknown,
    ctx: {
      mode: string;
      ui: {
        setWorkingIndicator(options?: typeof SHRIMPY_WORKING_INDICATOR): void;
        setFooter?(factory: unknown): void;
      };
    },
  ): void;
}

function assertFooterLines(
  lines: string[],
  expectedTrimmed: Array<string | RegExp>,
): void {
  assert.equal(lines.length, expectedTrimmed.length);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trimEnd();
    const expected = expectedTrimmed[index];
    if (expected instanceof RegExp) assert.match(trimmed, expected);
    else assert.equal(trimmed, expected);
    assert.ok(visibleWidth(line) <= 30);
  }
}
