import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import { stripPromptBriefingForDisplay } from "../context/index.js";

interface AddMessageOptions {
  populateHistory?: boolean;
}

type UserContentBlock = TextContent | ImageContent;
type UserMessage = Extract<AgentMessage, { role: "user" }>;

interface InteractiveModeContextInternals {
  toolOutputExpanded: boolean;
  addMessageToChat(message: AgentMessage, options?: AddMessageOptions): void;
  setToolsExpanded(expanded: boolean): void;
  pendingTools?: Map<string, unknown>;
  chatContainer: {
    addChild(child: unknown): void;
    removeChild?(child: unknown): void;
    clear(): void;
    children?: unknown[];
  };
  ui: {
    requestRender(): void;
  };
  rebuildChatFromMessages(): void;
  streamingComponent?: unknown;
  streamingMessage?: AgentMessage;
}

interface ExpandableComponent {
  setExpanded(expanded: boolean): void;
}

export function installShrimpyContextRendering(
  interactive: InteractiveMode,
): void {
  const mode = interactive as unknown as InteractiveModeContextInternals;
  const originalAddMessageToChat = mode.addMessageToChat.bind(mode);
  const originalSetToolsExpanded = mode.setToolsExpanded.bind(mode);

  mode.addMessageToChat = (
    message: AgentMessage,
    options?: AddMessageOptions,
  ) => {
    const displayMessage = mode.toolOutputExpanded
      ? message
      : collapseUserContextForDisplay(message);
    originalAddMessageToChat(displayMessage, options);
  };

  mode.setToolsExpanded = (expanded: boolean) => {
    const changed = mode.toolOutputExpanded !== expanded;
    const livePendingTools = snapshotPendingTools(mode);
    const streamingComponent = mode.streamingComponent;
    const streamingMessage = mode.streamingMessage;

    originalSetToolsExpanded(expanded);
    if (!changed) return;

    mode.rebuildChatFromMessages();
    restoreLiveComponents(
      mode,
      livePendingTools,
      streamingComponent,
      streamingMessage,
      expanded,
    );
    mode.ui.requestRender();
  };
}

export function stripLeadingContextBlockForDisplay(text: string): string {
  return stripPromptBriefingForDisplay(text);
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

function snapshotPendingTools(
  mode: InteractiveModeContextInternals,
): Map<string, unknown> {
  return mode.pendingTools ? new Map(mode.pendingTools) : new Map();
}

function restoreLiveComponents(
  mode: InteractiveModeContextInternals,
  livePendingTools: Map<string, unknown>,
  streamingComponent: unknown,
  streamingMessage: AgentMessage | undefined,
  expanded: boolean,
): void {
  if (streamingComponent && streamingMessage) {
    addChildIfMissing(mode.chatContainer, streamingComponent);
  }

  if (!mode.pendingTools) return;

  for (const [toolCallId, component] of livePendingTools) {
    const rebuiltComponent = mode.pendingTools.get(toolCallId);
    setExpandedIfSupported(component, expanded);

    if (rebuiltComponent === component) {
      addChildIfMissing(mode.chatContainer, component);
      continue;
    }

    if (rebuiltComponent) {
      replaceChild(mode.chatContainer, rebuiltComponent, component);
      mode.pendingTools.set(toolCallId, component);
      continue;
    }

    addChildIfMissing(mode.chatContainer, component);
    mode.pendingTools.set(toolCallId, component);
  }
}

function addChildIfMissing(
  chatContainer: InteractiveModeContextInternals["chatContainer"],
  component: unknown,
): void {
  if (chatContainer.children?.includes(component)) return;
  chatContainer.addChild(component);
}

function replaceChild(
  chatContainer: InteractiveModeContextInternals["chatContainer"],
  current: unknown,
  replacement: unknown,
): void {
  const index = chatContainer.children?.indexOf(current) ?? -1;
  if (index >= 0 && chatContainer.children) {
    chatContainer.children[index] = replacement;
    return;
  }

  chatContainer.removeChild?.(current);
  addChildIfMissing(chatContainer, replacement);
}

function setExpandedIfSupported(component: unknown, expanded: boolean): void {
  if (isExpandableComponent(component)) {
    component.setExpanded(expanded);
  }
}

function isExpandableComponent(
  component: unknown,
): component is ExpandableComponent {
  return typeof (component as ExpandableComponent | undefined)?.setExpanded === "function";
}
