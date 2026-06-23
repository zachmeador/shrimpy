import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
  SessionManager,
  type InteractiveMode,
  type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import {
  stripTurnContextPrefixForDisplay as stripTurnContextPrefixFromPrompt,
} from "../context/index.js";

interface AddMessageOptions {
  populateHistory?: boolean;
}

type UserContentBlock = TextContent | ImageContent;
type UserMessage = Extract<AgentMessage, { role: "user" }>;

interface InteractiveModeContextInternals {
  toolOutputExpanded: boolean;
  addMessageToChat(message: AgentMessage, options?: AddMessageOptions): void;
}

type SessionManagerWithPreviewPatch = typeof SessionManager & {
  __shrimpyPreviewContextStrippingInstalled?: boolean;
};
type SessionListProgress = (loaded: number, total: number) => void;
type SessionListAll = (
  sessionDirOrOnProgress?: string | SessionListProgress,
  onProgress?: SessionListProgress,
) => Promise<SessionInfo[]>;

export function installShrimpyContextRendering(
  interactive: InteractiveMode,
): void {
  installSessionPreviewContextStripping();

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

export function stripTurnContextPrefixForDisplay(text: string): string {
  return stripTurnContextPrefixFromPrompt(text);
}

export function stripSessionPreviewContextForDisplay(session: SessionInfo): SessionInfo {
  if (session.name) return session;

  const firstMessage = stripTurnContextPrefixForDisplay(session.firstMessage);
  return firstMessage === session.firstMessage
    ? session
    : { ...session, firstMessage };
}

function installSessionPreviewContextStripping(): void {
  const manager = SessionManager as SessionManagerWithPreviewPatch;
  if (manager.__shrimpyPreviewContextStrippingInstalled) return;

  const originalList = manager.list.bind(manager);
  const originalListAll = manager.listAll.bind(manager) as SessionListAll;

  manager.list = async (
    cwd: string,
    sessionDir?: string,
    onProgress?: SessionListProgress,
  ) => (await originalList(cwd, sessionDir, onProgress))
    .map(stripSessionPreviewContextForDisplay);

  manager.listAll = (async (
    sessionDirOrOnProgress?: string | SessionListProgress,
    onProgress?: SessionListProgress,
  ) => (await originalListAll(sessionDirOrOnProgress, onProgress))
    .map(stripSessionPreviewContextForDisplay)) as typeof SessionManager.listAll;

  manager.__shrimpyPreviewContextStrippingInstalled = true;
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
    const stripped = stripTurnContextPrefixForDisplay(content);
    return stripped === content ? content : stripped;
  }

  const [firstBlock] = content;
  if (firstBlock?.type !== "text") return content;

  const stripped = stripTurnContextPrefixForDisplay(firstBlock.text);
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
