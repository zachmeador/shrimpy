import type { SessionActivity, SessionItem, SessionStatus, SessionView } from "../../contracts/agent/index.ts";

/** A session as text for a person: each item under a label, then one line of status. */
export function renderSession(view: SessionView): string {
  const lines: string[] = [];
  for (const item of view.items) lines.push(...renderItem(item), "");
  lines.push(renderStatus(view.status));
  return lines.join("\n");
}

function renderItem(item: SessionItem): string[] {
  switch (item.type) {
    case "user":
      return ["you", ...indent(item.text)];
    case "assistant":
      return [`assistant${answerNote(item)}`, ...indent(item.text)];
    case "tool":
      return [
        `tool ${item.name} (${item.status})`,
        ...indent(item.args),
        ...indent(item.output.trimEnd()),
        ...item.notes.flatMap((note) => indent(`note: ${note}`)),
      ];
    case "marker":
      return [`-- ${item.marker} --`];
  }
}

function answerNote(item: Extract<SessionItem, { type: "assistant" }>): string {
  if (item.streaming) return " (answering)";
  if (item.stopReason === "aborted") return " (cut off)";
  if (item.stopReason === "error") return " (failed)";
  return "";
}

function renderStatus(status: SessionStatus): string {
  const model = status.model === null ? "no model" : `${status.model.provider}/${status.model.id}`;
  const parts = [describe(status.activity), model, `${status.usage.input} in, ${status.usage.output} out`];
  if (status.usage.cost > 0) parts.push(`$${status.usage.cost.toFixed(4)}`);
  if (status.queued.length > 0) parts.push(`${status.queued.length} queued`);
  return parts.join(" · ");
}

function describe(activity: SessionActivity): string {
  switch (activity.kind) {
    case "idle":
      return "idle";
    case "working":
      return "working";
    case "answering":
      return "answering";
    case "tool":
      return `running ${activity.name}`;
    case "retrying":
      return `retrying after: ${activity.error}`;
  }
}

/** The lines of `text`, each indented two spaces; no lines for no text. */
export function indent(text: string): string[] {
  return text === "" ? [] : text.split("\n").map((line) => `  ${line}`);
}
