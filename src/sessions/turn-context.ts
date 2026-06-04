import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { ImageContent, UserMessage } from "@earendil-works/pi-ai";
import { formatPromptWithTurnContext } from "../context/index.js";

export interface ActiveSessionTurnContext {
  prompt: string;
  text: string;
}

export interface SessionTurnContextController {
  prepareForPrompt(prompt: string, images?: ImageContent[]): Promise<void>;
  clear(): void;
  rewriteMessage(message: AgentMessage): AgentMessage | undefined;
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

    rewriteMessage(message) {
      if (!active) return undefined;
      const replacement = rewritePromptMessage(message, active);
      if (replacement) active = undefined;
      return replacement;
    },

    transform(messages) {
      return messages;
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

    pi.on("message_end", (event) => {
      const message = controller.rewriteMessage(event.message);
      return message ? { message } : undefined;
    });

    pi.on("agent_end", () => {
      controller.clear();
    });
  };
}

function rewritePromptMessage(
  message: AgentMessage,
  active: ActiveSessionTurnContext,
): AgentMessage | undefined {
  if (message.role !== "user" || userMessageText(message) !== active.prompt) {
    return undefined;
  }

  return {
    ...message,
    content: rewriteUserContent(message.content, active),
  } as AgentMessage;
}

function rewriteUserContent(
  content: UserMessage["content"],
  active: ActiveSessionTurnContext,
): UserMessage["content"] {
  const text = formatPromptWithTurnContext(active.prompt, active.text);
  if (typeof content === "string") return text;
  return [
    { type: "text", text },
    ...content.filter((block) => block.type !== "text"),
  ];
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
