import type { NodeResponse } from "../../shared/types.js";

export interface SummaryItem {
  label: string;
  value: string;
  title?: string;
}

export interface NodeSummary {
  items: SummaryItem[];
  partial: boolean;
}

export function summarizeNode(node: NodeResponse | null): NodeSummary {
  if (!node) return { items: [], partial: false };
  if (node.mode !== "jsonl") {
    return {
      items: node.mtimeMs
        ? [{
          label: "modified",
          value: formatInstant(node.mtimeMs),
          title: new Date(node.mtimeMs).toISOString(),
        }]
        : [],
      partial: false,
    };
  }
  if (node.kind === "session") return summarizeSession(node.events, node.truncated);
  if (node.kind === "channel") return summarizeChannel(node.events, node.truncated);
  return {
    items: node.mtimeMs
      ? [{
        label: "modified",
        value: formatInstant(node.mtimeMs),
        title: new Date(node.mtimeMs).toISOString(),
      }]
      : [],
    partial: node.truncated,
  };
}

export function summarizeSession(
  events: readonly unknown[],
  partial = false,
): NodeSummary {
  const roles = new Map<string, number>();
  let model: { provider: string; id: string } | undefined;
  let thinking: string | undefined;
  let toolCalls = 0;
  let totalCost = 0;
  let state: "active" | "archived" = "active";
  const times: number[] = [];

  for (const event of events) {
    if (!isRecord(event)) continue;
    collectTimestamp(event, times);

    if (
      event.type === "model_change"
      && typeof event.provider === "string"
      && typeof event.modelId === "string"
    ) {
      model = { provider: event.provider, id: event.modelId };
    }
    if (
      event.type === "thinking_level_change"
      && typeof event.thinkingLevel === "string"
    ) {
      thinking = event.thinkingLevel;
    }
    if (event.type === "custom" && event.customType === "shrimpy_session_metadata") {
      const data = isRecord(event.data) ? event.data : undefined;
      const env = data && isRecord(data.env) ? data.env : undefined;
      if (
        env
        && typeof env.provider === "string"
        && typeof env.model_id === "string"
      ) {
        model = { provider: env.provider, id: env.model_id };
      }
    }
    if (event.type === "custom" && event.customType === "shrimpy_lifecycle") {
      const data = isRecord(event.data) ? event.data : undefined;
      if (data?.state === "active" || data?.state === "archived") {
        state = data.state;
      }
    }
    if (event.type === "custom_message" && isRecord(event.details)) {
      if (typeof event.details.thinkingLevel === "string") {
        thinking = event.details.thinkingLevel;
      }
      const current = isRecord(event.details.current)
        ? event.details.current
        : undefined;
      if (
        current
        && typeof current.provider === "string"
        && typeof current.id === "string"
      ) {
        model = { provider: current.provider, id: current.id };
      }
    }
    if (event.type !== "message" || !isRecord(event.message)) continue;

    const message = event.message;
    if (typeof message.role === "string") {
      roles.set(message.role, (roles.get(message.role) ?? 0) + 1);
    }
    if (
      message.role === "assistant"
      && typeof message.provider === "string"
      && typeof message.model === "string"
    ) {
      model = { provider: message.provider, id: message.model };
    }
    if (Array.isArray(message.content)) {
      toolCalls += message.content.filter(
        (block) => isRecord(block) && block.type === "toolCall",
      ).length;
    }
    const usage = isRecord(message.usage) ? message.usage : undefined;
    const cost = usage && isRecord(usage.cost) ? usage.cost.total : undefined;
    if (typeof cost === "number" && Number.isFinite(cost)) totalCost += cost;
  }

  const items: SummaryItem[] = [];
  if (model) {
    items.push({
      label: "model",
      value: `${model.provider}/${model.id}`,
    });
  }
  if (thinking) items.push({ label: "thinking", value: thinking });
  if (roles.size > 0) {
    items.push({
      label: "messages",
      value: formatRoleCounts(roles),
      title: [...roles.entries()]
        .map(([role, count]) => `${role}: ${count}`)
        .join(", "),
    });
  }
  if (toolCalls > 0) items.push({ label: "tools", value: String(toolCalls) });
  items.push({ label: "cost", value: formatCost(totalCost) });
  const span = timestampSummary(times);
  if (span) items.push(span);
  items.push({ label: "state", value: state });

  return { items, partial };
}

export function summarizeChannel(
  events: readonly unknown[],
  partial = false,
): NodeSummary {
  const senders = new Map<string, number>();
  const times: number[] = [];

  for (const event of events) {
    if (!isRecord(event)) continue;
    collectTimestamp(event, times);
    if (!isRecord(event.sender) || typeof event.sender.kind !== "string") continue;
    const kind = event.sender.kind;
    senders.set(kind, (senders.get(kind) ?? 0) + 1);
  }

  const items: SummaryItem[] = [];
  if (senders.size > 0) {
    items.push({
      label: "senders",
      value: formatRoleCounts(senders, ["human", "agent", "system"]),
      title: [...senders.entries()]
        .map(([kind, count]) => `${kind}: ${count}`)
        .join(", "),
    });
  }
  const span = timestampSummary(times);
  if (span) items.push(span);
  return { items, partial };
}

function collectTimestamp(event: Record<string, unknown>, target: number[]): void {
  const eventTime = timestampValue(event.timestamp);
  if (eventTime !== undefined) {
    target.push(eventTime);
    return;
  }
  if (!isRecord(event.message)) return;
  const messageTime = timestampValue(event.message.timestamp);
  if (messageTime !== undefined) target.push(messageTime);
}

function timestampValue(value: unknown): number | undefined {
  const milliseconds = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Date.parse(value)
      : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function timestampSummary(times: readonly number[]): SummaryItem | undefined {
  if (times.length === 0) return undefined;
  let first = times[0]!;
  let last = times[0]!;
  for (const time of times.slice(1)) {
    first = Math.min(first, time);
    last = Math.max(last, time);
  }
  return {
    label: "span",
    value: first === last
      ? formatInstant(first)
      : `${formatInstant(first)} → ${formatInstant(last)}`,
    title: first === last
      ? new Date(first).toISOString()
      : `${new Date(first).toISOString()} → ${new Date(last).toISOString()}`,
  };
}

function formatInstant(milliseconds: number): string {
  const iso = new Date(milliseconds).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

function formatRoleCounts(
  counts: ReadonlyMap<string, number>,
  order = ["user", "assistant", "toolResult", "system"],
): string {
  return [...counts.entries()]
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    })
    .map(([role, count]) => `${roleLabel(role)}${count}`)
    .join(" ");
}

function roleLabel(role: string): string {
  switch (role) {
    case "user": return "U";
    case "assistant": return "A";
    case "toolResult": return "T";
    case "system": return "S";
    case "human": return "H";
    case "agent": return "A";
    default: return `${role.slice(0, 1).toUpperCase() || "?"}`;
  }
}

function formatCost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
