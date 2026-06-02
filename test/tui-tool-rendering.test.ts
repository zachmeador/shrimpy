import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import { installShrimpyToolRendering } from "../dist/tui/shrimpy-tool-rendering.js";

test("Shrimpy tool rendering follows Pi tool-output expansion state", () => {
  let cleared = 0;
  let rebuilt = 0;

  const interactive = {
    toolOutputExpanded: false,
    setToolsExpanded(expanded: boolean): void {
      this.toolOutputExpanded = expanded;
    },
    chatContainer: {
      addChild(): void {},
      clear(): void {
        cleared += 1;
      },
    },
    rebuildChatFromMessages(): void {
      rebuilt += 1;
      this.chatContainer.clear();
    },
    ui: {
      requestRender(): void {},
    },
  } as unknown as InteractiveMode & {
    setToolsExpanded(expanded: boolean): void;
  };

  installShrimpyToolRendering(interactive);

  interactive.setToolsExpanded(true);

  assert.equal(cleared, 1);
  assert.equal(rebuilt, 1);
});

test("Shrimpy tool rendering preserves live Pi tool rows across expansion rebuilds", () => {
  const children: unknown[] = [];
  let cleared = 0;
  let rebuilt = 0;
  let renderRequests = 0;
  const rebuiltHistory = { render: () => ["history"] };
  const streamingComponent = { render: () => ["streaming"] };
  const activeTool = {
    expanded: false,
    setExpanded(expanded: boolean): void {
      this.expanded = expanded;
    },
    render: () => ["active tool"],
  };

  const interactive = {
    toolOutputExpanded: false,
    pendingTools: new Map<string, unknown>([["tool-1", activeTool]]),
    setToolsExpanded(expanded: boolean): void {
      this.toolOutputExpanded = expanded;
      for (const child of this.chatContainer.children) {
        if (hasSetExpanded(child)) child.setExpanded(expanded);
      }
      this.ui.requestRender();
    },
    chatContainer: {
      children,
      addChild(child: unknown): void {
        children.push(child);
      },
      clear(): void {
        cleared += 1;
        children.length = 0;
      },
    },
    rebuildChatFromMessages(): void {
      rebuilt += 1;
      this.chatContainer.clear();
      this.pendingTools.clear();
      this.chatContainer.addChild(rebuiltHistory);
    },
    streamingComponent,
    streamingMessage: { role: "assistant" } as AgentMessage,
    ui: {
      requestRender(): void {
        renderRequests += 1;
      },
    },
  };
  children.push(streamingComponent, activeTool);

  installShrimpyToolRendering(interactive as unknown as InteractiveMode);

  interactive.setToolsExpanded(true);

  assert.equal(activeTool.expanded, true);
  assert.equal(cleared, 1);
  assert.equal(rebuilt, 1);
  assert.equal(renderRequests, 2);
  assert.deepEqual(children, [rebuiltHistory, streamingComponent, activeTool]);
  assert.equal(interactive.pendingTools.get("tool-1"), activeTool);
});

test("Shrimpy tool rendering keeps live pending tool state over rebuilt placeholders", () => {
  const children: unknown[] = [];
  let renderRequests = 0;
  const rebuiltTool = {
    setExpanded(): void {},
    render: () => ["rebuilt placeholder"],
  };
  const activeTool = {
    expanded: false,
    setExpanded(expanded: boolean): void {
      this.expanded = expanded;
    },
    render: () => ["live partial result"],
  };

  const interactive = {
    toolOutputExpanded: false,
    pendingTools: new Map<string, unknown>([["tool-1", activeTool]]),
    setToolsExpanded(expanded: boolean): void {
      this.toolOutputExpanded = expanded;
      for (const child of this.chatContainer.children) {
        if (hasSetExpanded(child)) child.setExpanded(expanded);
      }
      this.ui.requestRender();
    },
    chatContainer: {
      children,
      addChild(child: unknown): void {
        children.push(child);
      },
      clear(): void {
        children.length = 0;
      },
    },
    rebuildChatFromMessages(): void {
      this.chatContainer.clear();
      this.pendingTools.clear();
      this.pendingTools.set("tool-1", rebuiltTool);
      this.chatContainer.addChild(rebuiltTool);
    },
    ui: {
      requestRender(): void {
        renderRequests += 1;
      },
    },
  };
  children.push(activeTool);

  installShrimpyToolRendering(interactive as unknown as InteractiveMode);

  interactive.setToolsExpanded(true);

  assert.equal(activeTool.expanded, true);
  assert.equal(renderRequests, 2);
  assert.deepEqual(children, [activeTool]);
  assert.equal(interactive.pendingTools.get("tool-1"), activeTool);
});

function hasSetExpanded(
  value: unknown,
): value is { setExpanded(expanded: boolean): void } {
  return typeof (value as { setExpanded?: unknown } | undefined)?.setExpanded === "function";
}
