import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type {
  ConversationView,
  EntryRecord,
  InboxState,
  LiveState,
  ToolDiagnostic,
  UsageState,
} from "@earendil-works/pi-durable";
import type {
  QueuedInput,
  SessionActivity,
  SessionItem,
  SessionStatus,
  SessionView,
} from "../../contracts/agent/index.ts";
import { assistantText } from "../turns/durable.ts";

type ToolItem = Extract<SessionItem, { type: "tool" }>;
type Content = string | readonly { type: string; text?: string }[];

/** Build the view clients see from the engine's committed records. */
export function toSessionView(view: ConversationView): SessionView {
  const live = (view.docs["pi.live"] ?? {}) as LiveState;
  return {
    items: toItems(view.entries, live),
    status: toStatus(view, live),
    entries: view.entries.length,
  };
}

function toItems(entries: readonly EntryRecord[], live: LiveState): SessionItem[] {
  const items: SessionItem[] = [];
  const tools = new Map<string, ToolItem>();
  for (const entry of entries) {
    const message = entry.model?.[0];
    if (entry.kind === "pi.user" && message?.role === "user") {
      items.push({ type: "user", text: textOf(message.content) });
    } else if (entry.kind === "pi.assistant" && message?.role === "assistant") {
      items.push(assistantItem(message, false));
      for (const tool of toolItems(message, live)) {
        // Only an answer that stopped to use tools runs its calls.
        if (message.stopReason !== "toolUse") {
          tool.status = "error";
          tool.output = "Not run: the answer was interrupted.";
        }
        tools.set(tool.id, tool);
        items.push(tool);
      }
    } else if (entry.kind === "pi.tool-result" && message?.role === "toolResult") {
      const tool = tools.get(message.toolCallId);
      if (tool !== undefined) finishTool(tool, entry, message);
    } else if (entry.kind === "pi.reset") {
      items.push({ type: "marker", marker: "reset" });
    } else if (entry.kind === "pi.compaction") {
      items.push({ type: "marker", marker: "compaction" });
    }
  }
  const partial = live.generation?.message as AssistantMessage | undefined;
  if (partial !== undefined) {
    items.push(assistantItem(partial, true));
    for (const tool of toolItems(partial, live)) {
      if (!tools.has(tool.id)) items.push(tool);
    }
  }
  return items;
}

function assistantItem(message: AssistantMessage, streaming: boolean): SessionItem {
  let thinking = "";
  for (const block of message.content) {
    if (block.type === "thinking") thinking += block.thinking;
  }
  // A partial answer has no stop reason yet.
  const stopReason = (message as { stopReason?: string }).stopReason ?? null;
  return { type: "assistant", text: assistantText(message), thinking, streaming, stopReason };
}

function toolItems(message: AssistantMessage, live: LiveState): ToolItem[] {
  const items: ToolItem[] = [];
  for (const block of message.content) {
    if (block.type !== "toolCall") continue;
    const slot = live.tools?.find((candidate) => candidate.callId === block.id);
    items.push({
      type: "tool",
      id: block.id,
      name: block.name,
      args: JSON.stringify(block.arguments),
      status: slot?.status === "running" ? "running" : "pending",
      output: slot?.output ?? "",
      notes: [],
    });
  }
  return items;
}

/**
 * A result entry stores the text the model saw, which ends with a rendered
 * <harness> block, and the same facts as structured diagnostics. The view
 * uses the structured form: `interrupted` marks a call recovery did not rerun.
 */
function finishTool(tool: ToolItem, entry: EntryRecord, result: ToolResultMessage): void {
  const data = entry.data as { diagnostics?: ToolDiagnostic[] } | undefined;
  const diagnostics = data?.diagnostics ?? [];
  tool.output = textOf(result.content).replace(/\n?<harness>[\s\S]*<\/harness>\s*$/, "");
  tool.notes = diagnostics.map((diagnostic) => diagnostic.message);
  if (!result.isError) tool.status = "done";
  else if (diagnostics.some((diagnostic) => diagnostic.code === "interrupted")) {
    tool.status = "interrupted";
  } else tool.status = "error";
}

function toStatus(view: ConversationView, live: LiveState): SessionStatus {
  const inbox = (view.docs["pi.inbox"] ?? { items: [] }) as InboxState;
  const agent = (view.docs["pi.agent"] ?? {}) as {
    model?: { provider: string; modelId: string };
  };
  const spend = (view.docs["pi.usage"] ?? { models: {}, tools: {} }) as UsageState;
  const usage = { input: 0, output: 0, cost: 0 };
  for (const used of Object.values(spend.models)) {
    usage.input += used.input;
    usage.output += used.output;
    usage.cost += used.cost.total;
  }
  return {
    activity: toActivity(live),
    busy: live.run !== undefined,
    queued: inbox.items.map(toQueued),
    model: agent.model ? { provider: agent.model.provider, id: agent.model.modelId } : null,
    usage,
  };
}

function toActivity(live: LiveState): SessionActivity {
  if (live.generation?.retry !== undefined) {
    return { kind: "retrying", error: live.generation.retry.error };
  }
  const running = live.tools?.find((slot) => slot.status === "running");
  if (running !== undefined) return { kind: "tool", name: running.name };
  if (live.generation !== undefined) return { kind: "answering" };
  if (live.run !== undefined) return { kind: "working" };
  return { kind: "idle" };
}

function toQueued(item: InboxState["items"][number]): QueuedInput {
  if (item.mode === "write") {
    const kind = item.entry.kind;
    return { mode: "write", text: typeof kind === "string" ? kind : "entry" };
  }
  return { mode: item.mode, text: textOf(item.content as Message["content"]) };
}

function textOf(content: Content): string {
  if (typeof content === "string") return content;
  return content.map((block) => (block.type === "text" ? (block.text ?? "") : "[image]")).join("");
}
