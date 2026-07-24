import type {
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ImageContent,
  TextContent,
  UserMessage,
} from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { formatTrailingTurnContext, formatTurnContextPrefix } from "../context/turn/prompt-prefix.js";

export const TURN_CONTEXT_CUSTOM_TYPE = "shrimpy_turn_context";

interface TurnContextMessageDetails {
  text: string;
}

export interface SessionTurnContextController {
  prepareForPrompt(prompt: string, images?: ImageContent[]): Promise<string | undefined>;
}

export type PrepareSessionTurnContext = (
  prompt: string,
  images?: ImageContent[],
) => Promise<string | undefined> | string | undefined;

export function createSessionTurnContextController(opts?: {
  prepare?: PrepareSessionTurnContext;
}): SessionTurnContextController {
  return {
    async prepareForPrompt(prompt, images) {
      if (prompt.startsWith("/") || !opts?.prepare) return undefined;

      const prepared = await opts.prepare(prompt, images);
      const text = prepared?.trim();
      return text || undefined;
    },
  };
}

export function createTurnContextExtensionFactory(
  controller: SessionTurnContextController,
): ExtensionFactory {
  return (pi) => {
    pi.registerMessageRenderer<TurnContextMessageDetails>(
      TURN_CONTEXT_CUSTOM_TYPE,
      (message, { expanded }, theme) => {
        if (!expanded) return new Text("", 0, 0);

        const text = message.details?.text?.trim();
        if (!text) return new Text("", 0, 0);

        return new Text(theme.fg("dim", text), 1, 0);
      },
    );

    pi.on("before_agent_start", async (event) => {
      const text = await controller.prepareForPrompt(event.prompt, event.images);
      if (!text) return undefined;
      return {
        message: {
          customType: TURN_CONTEXT_CUSTOM_TYPE,
          content: formatTrailingTurnContext(text),
          display: true,
          details: { text } satisfies TurnContextMessageDetails,
        },
      };
    });

    pi.on("context", (event) => {
      const messages = normalizeTurnContextMessages(event.messages);
      return messages === event.messages ? undefined : { messages };
    });
  };
}

export function normalizeTurnContextMessages(
  messages: AgentMessage[],
): AgentMessage[] {
  let normalized: AgentMessage[] | undefined;

  for (
    let index = 0;
    index < (normalized ?? messages).length;
    index += 1
  ) {
    const source = normalized ?? messages;
    const message = source[index];
    const text = turnContextMessageText(message);
    if (!text) continue;

    const userIndex = precedingUserMessageIndex(source, index);
    if (userIndex < 0) continue;

    const userMessage = source[userIndex];
    if (userMessage.role !== "user") continue;

    normalized ??= [...messages];
    normalized[userIndex] = prefixUserMessage(userMessage, text);
    normalized.splice(index, 1);
    index -= 1;
  }

  return normalized ?? messages;
}

function turnContextMessageText(message: AgentMessage): string | undefined {
  if (
    message.role !== "custom"
    || message.customType !== TURN_CONTEXT_CUSTOM_TYPE
  ) {
    return undefined;
  }
  const details = message.details;
  if (
    typeof details !== "object"
    || details === null
    || !("text" in details)
    || typeof details.text !== "string"
  ) {
    return undefined;
  }
  return details.text.trim() || undefined;
}

function precedingUserMessageIndex(
  messages: AgentMessage[],
  contextIndex: number,
): number {
  for (let index = contextIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") return index;
    if (message.role === "assistant" || message.role === "toolResult") return -1;
  }
  return -1;
}

function prefixUserMessage(
  message: UserMessage,
  turnContextText: string,
): UserMessage {
  const prefix = `${formatTurnContextPrefix(turnContextText)}\n\n`;
  if (typeof message.content === "string") {
    return {
      ...message,
      content: `${prefix}${message.content}`,
    };
  }
  const content = [...message.content];
  const firstTextIndex = content.findIndex(
    (item): item is TextContent => item.type === "text",
  );
  if (firstTextIndex < 0) {
    content.unshift({ type: "text", text: prefix.trimEnd() });
  } else {
    const firstText = content[firstTextIndex] as TextContent;
    content[firstTextIndex] = {
      ...firstText,
      text: `${prefix}${firstText.text}`,
    };
  }
  return { ...message, content };
}
