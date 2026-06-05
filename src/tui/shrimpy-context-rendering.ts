import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import { stripPromptTurnContextForDisplay } from "../context/index.js";

interface AddMessageOptions {
  populateHistory?: boolean;
}

type UserContentBlock = TextContent | ImageContent;
type UserMessage = Extract<AgentMessage, { role: "user" }>;

interface InteractiveModeContextInternals {
  toolOutputExpanded: boolean;
  addMessageToChat(message: AgentMessage, options?: AddMessageOptions): void;
}

export function installShrimpyContextRendering(
  interactive: InteractiveMode,
): void {
  const mode = interactive as unknown as InteractiveModeContextInternals;
  const originalAddMessageToChat = mode.addMessageToChat.bind(mode);

  mode.addMessageToChat = (
    message: AgentMessage,
    options?: AddMessageOptions,
  ) => {
    const displayMessage = mode.toolOutputExpanded
      ? message
      : collapseUserContextForDisplay(message);
    originalAddMessageToChat(displayMessage, options);
  };
}

export function stripLeadingContextBlockForDisplay(text: string): string {
  return stripPromptTurnContextForDisplay(text);
}

function collapseUserContextForDisplay(message: AgentMessage): AgentMessage {
  if (!isUserMessage(message)) return message;

  const content = stripUserContentContext(message.content);
  if (content === message.content) return message;

  return {
    ...message,
    content,
  };
}

function stripUserContentContext(
  content: UserMessage["content"],
): UserMessage["content"] {
  if (typeof content === "string") {
    const stripped = stripLeadingContextBlockForDisplay(content);
    return stripped === content ? content : stripped;
  }

  const [firstBlock] = content;
  if (firstBlock?.type !== "text") return content;

  const stripped = stripLeadingContextBlockForDisplay(firstBlock.text);
  if (stripped === firstBlock.text) return content;

  const nextContent = [...content];
  nextContent[0] = {
    ...firstBlock,
    text: stripped,
  };

  return nextContent.filter(hasRenderableUserContent);
}

function hasRenderableUserContent(block: UserContentBlock): boolean {
  return block.type !== "text" || block.text.length > 0;
}

function isUserMessage(message: AgentMessage): message is UserMessage {
  return message.role === "user";
}
