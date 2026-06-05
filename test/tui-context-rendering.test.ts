import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import { formatPromptWithTurnContext } from "../dist/context/index.js";
import {
  installShrimpyContextRendering,
  stripLeadingContextBlockForDisplay,
} from "../dist/tui/shrimpy-context-rendering.js";
import { installShrimpyToolRendering } from "../dist/tui/shrimpy-tool-rendering.js";

test("context block display stripping leaves the actual prompt body", () => {
  assert.equal(
    stripLeadingContextBlockForDisplay(
      formatPromptWithTurnContext("what changed?", "workspace notes"),
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

test("Shrimpy context rendering strips leading context while collapsed", () => {
  const captured: AgentMessage[] = [];
  const interactive = {
    toolOutputExpanded: false,
    addMessageToChat(message: AgentMessage): void {
      captured.push(message);
    },
  } as unknown as InteractiveMode & {
    addMessageToChat(message: AgentMessage): void;
  };

  installShrimpyContextRendering(interactive);

  const message: AgentMessage = {
    role: "user",
    content: formatPromptWithTurnContext("hello", "private turn context"),
    timestamp: 1,
  };

  interactive.addMessageToChat(message);

  assert.deepEqual(captured, [
    {
      role: "user",
      content: "hello",
      timestamp: 1,
    },
  ]);
});

test("Shrimpy context rendering preserves the original message while expanded", () => {
  const captured: AgentMessage[] = [];
  const interactive = {
    toolOutputExpanded: true,
    addMessageToChat(message: AgentMessage): void {
      captured.push(message);
    },
  } as unknown as InteractiveMode & {
    addMessageToChat(message: AgentMessage): void;
  };

  installShrimpyContextRendering(interactive);

  const message: AgentMessage = {
    role: "user",
    content: formatPromptWithTurnContext("hello", "private turn context"),
    timestamp: 1,
  };

  interactive.addMessageToChat(message);

  assert.equal(captured[0], message);
});

test("Shrimpy context rendering preserves non-text user content", () => {
  const captured: AgentMessage[] = [];
  const interactive = {
    toolOutputExpanded: false,
    addMessageToChat(message: AgentMessage): void {
      captured.push(message);
    },
  } as unknown as InteractiveMode & {
    addMessageToChat(message: AgentMessage): void;
  };

  installShrimpyContextRendering(interactive);

  const message: AgentMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: formatPromptWithTurnContext("caption", "private turn context"),
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

test("Shrimpy context rendering follows Ctrl+O expansion rebuild state", () => {
  const captured: AgentMessage[] = [];
  const message: AgentMessage = {
    role: "user",
    content: formatPromptWithTurnContext("hello", "private turn context"),
    timestamp: 1,
  };

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
      clear(): void {},
    },
    rebuildChatFromMessages(): void {
      this.addMessageToChat(message);
    },
    ui: {
      requestRender(): void {},
    },
  } as unknown as InteractiveMode & {
    addMessageToChat(message: AgentMessage): void;
    setToolsExpanded(expanded: boolean): void;
  };

  installShrimpyContextRendering(interactive);
  installShrimpyToolRendering(interactive);

  interactive.addMessageToChat(message);
  interactive.setToolsExpanded(true);

  assert.equal(captured.length, 2);
  assert.deepEqual(captured[0], {
    role: "user",
    content: "hello",
    timestamp: 1,
  });
  assert.equal(captured[1], message);
});
