import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import {
  installShrimpyContextRendering,
  stripLeadingContextBlockForDisplay,
} from "../dist/tui/shrimpy-context-rendering.js";

test("context block display stripping leaves the actual prompt body", () => {
  assert.equal(
    stripLeadingContextBlockForDisplay(
      "<context>\nworkspace notes\n</context>\n\nwhat changed?",
    ),
    "what changed?",
  );
  assert.equal(
    stripLeadingContextBlockForDisplay("show me <context> literally"),
    "show me <context> literally",
  );
  assert.equal(
    stripLeadingContextBlockForDisplay("<context>\nunterminated"),
    "<context>\nunterminated",
  );
});

test("Shrimpy context rendering follows Pi tool-output expansion state", () => {
  const captured: AgentMessage[] = [];
  let cleared = 0;
  let rebuilt = 0;

  const interactive = {
    toolOutputExpanded: false,
    addMessageToChat(message: AgentMessage): void {
      captured.push(message);
    },
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
    addMessageToChat(message: AgentMessage): void;
    setToolsExpanded(expanded: boolean): void;
  };

  installShrimpyContextRendering(interactive);

  const message: AgentMessage = {
    role: "user",
    content: "<context>\nprivate turn context\n</context>\n\nhello",
    timestamp: 1,
  };

  interactive.addMessageToChat(message);
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.role, "user");
  assert.equal(captured[0]?.content, "hello");

  interactive.setToolsExpanded(true);
  interactive.addMessageToChat(message);
  assert.equal(captured.length, 2);
  assert.equal(captured[1], message);
  assert.equal(cleared, 1);
  assert.equal(rebuilt, 1);
});

test("Shrimpy context rendering preserves live Pi tool rows across expansion rebuilds", () => {
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
    addMessageToChat(): void {},
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

  installShrimpyContextRendering(interactive as unknown as InteractiveMode);

  interactive.setToolsExpanded(true);

  assert.equal(activeTool.expanded, true);
  assert.equal(cleared, 1);
  assert.equal(rebuilt, 1);
  assert.equal(renderRequests, 2);
  assert.deepEqual(children, [rebuiltHistory, streamingComponent, activeTool]);
  assert.equal(interactive.pendingTools.get("tool-1"), activeTool);
});

test("Shrimpy context rendering keeps live pending tool state over rebuilt placeholders", () => {
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
    addMessageToChat(): void {},
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

  installShrimpyContextRendering(interactive as unknown as InteractiveMode);

  interactive.setToolsExpanded(true);

  assert.equal(activeTool.expanded, true);
  assert.equal(renderRequests, 2);
  assert.deepEqual(children, [activeTool]);
  assert.equal(interactive.pendingTools.get("tool-1"), activeTool);
});

test("Shrimpy context rendering preserves non-text user content", () => {
  const captured: AgentMessage[] = [];
  const interactive = {
    toolOutputExpanded: false,
    addMessageToChat(message: AgentMessage): void {
      captured.push(message);
    },
    setToolsExpanded(expanded: boolean): void {
      this.toolOutputExpanded = expanded;
    },
    chatContainer: {
      clear(): void {},
    },
    rebuildChatFromMessages(): void {},
  } as unknown as InteractiveMode & {
    addMessageToChat(message: AgentMessage): void;
  };

  installShrimpyContextRendering(interactive);

  const message: AgentMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: "<context>\nprivate turn context\n</context>\n\ncaption",
      },
      {
        type: "image",
        data: "abc",
        mimeType: "image/png",
      },
    ],
    timestamp: 1,
  };

  interactive.addMessageToChat(message);

  assert.deepEqual(captured[0], {
    role: "user",
    content: [
      {
        type: "text",
        text: "caption",
      },
      {
        type: "image",
        data: "abc",
        mimeType: "image/png",
      },
    ],
    timestamp: 1,
  });
});

function hasSetExpanded(
  value: unknown,
): value is { setExpanded(expanded: boolean): void } {
  return typeof (value as { setExpanded?: unknown } | undefined)?.setExpanded === "function";
}
