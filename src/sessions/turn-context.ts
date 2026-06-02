import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai";
import { formatEphemeralTurnContext } from "../context/index.js";

export interface ActiveSessionTurnContext {
  prompt: string;
  text: string;
}

export interface SessionTurnContextController {
  prepareForPrompt(prompt: string, images?: ImageContent[]): Promise<void>;
  clear(): void;
  transform(messages: AgentMessage[]): AgentMessage[];
}

export type PrepareSessionTurnContext = (
  prompt: string,
  images?: ImageContent[],
) => Promise<string | undefined> | string | undefined;

export function createSessionTurnContextController(opts?: {
  prepare?: PrepareSessionTurnContext;
}): SessionTurnContextController {
  let active: ActiveSessionTurnContext | undefined;

  return {
    async prepareForPrompt(prompt, images) {
      if (prompt.startsWith("/")) {
        active = undefined;
        return;
      }
      if (!opts?.prepare) return;

      const prepared = await opts.prepare(prompt, images);
      const text = prepared?.trim();
      active = text ? { prompt, text } : undefined;
    },

    clear() {
      active = undefined;
    },

    transform(messages) {
      return active ? injectTurnContext(messages, active) : messages;
    },
  };
}

export function createTurnContextExtensionFactory(
  controller: SessionTurnContextController,
): ExtensionFactory {
  return (pi) => {
    pi.on("before_agent_start", async (event) => {
      await controller.prepareForPrompt(event.prompt, event.images);
    });

    pi.on("context", (event) => ({
      messages: controller.transform(event.messages),
    }));

    pi.on("agent_end", () => {
      controller.clear();
    });
  };
}

function injectTurnContext(
  messages: AgentMessage[],
  active: ActiveSessionTurnContext,
): AgentMessage[] {
  const promptIndex = findLatestUserPromptIndex(messages, active.prompt);
  if (promptIndex < 0) return messages;

  return [
    ...messages.slice(0, promptIndex),
    {
      role: "user",
      content: [{
        type: "text",
        text: formatEphemeralTurnContext(active.text),
      }],
      timestamp: Date.now(),
    },
    ...messages.slice(promptIndex),
  ];
}

function findLatestUserPromptIndex(
  messages: AgentMessage[],
  prompt: string,
): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user" && userMessageText(message) === prompt) {
      return index;
    }
  }
  return -1;
}

function userMessageText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
