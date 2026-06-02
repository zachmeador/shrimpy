import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";

interface InteractiveModeToolInternals {
  toolOutputExpanded: boolean;
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

export function installShrimpyToolRendering(
  interactive: InteractiveMode,
): void {
  const mode = interactive as unknown as InteractiveModeToolInternals;
  const originalSetToolsExpanded = mode.setToolsExpanded.bind(mode);

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

function snapshotPendingTools(
  mode: InteractiveModeToolInternals,
): Map<string, unknown> {
  return mode.pendingTools ? new Map(mode.pendingTools) : new Map();
}

function restoreLiveComponents(
  mode: InteractiveModeToolInternals,
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
  chatContainer: InteractiveModeToolInternals["chatContainer"],
  component: unknown,
): void {
  if (chatContainer.children?.includes(component)) return;
  chatContainer.addChild(component);
}

function replaceChild(
  chatContainer: InteractiveModeToolInternals["chatContainer"],
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
