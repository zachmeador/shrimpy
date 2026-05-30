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
      clear(): void {
        cleared += 1;
      },
    },
    rebuildChatFromMessages(): void {
      rebuilt += 1;
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
