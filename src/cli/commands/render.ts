import { failureWords, type SessionActivity, type SessionImage, type SessionItem, type SessionStatus } from "../../contracts/agent/index.ts";
import { localTime } from "../../lib/time/index.ts";

/** A session whole: every item, oldest first, and what it is doing now. */
export interface WholeSession {
  items: SessionItem[];
  status: SessionStatus;
}

/**
 * A session as text for a person: each item under a label, then one line of
 * status, then why its last turn ended without an answer, when it did, and a
 * line for each wake-up it is waiting on, with `stop`, the command that cancels
 * them.
 */
export function renderSession(view: WholeSession, stop: string): string {
  const lines: string[] = [];
  for (const item of view.items) lines.push(...renderItem(item), "");
  lines.push(renderStatus(view.status));
  const { failure, wakeups } = view.status;
  if (failure !== null) lines.push(`Last turn: ${failureWords(failure.reason, failure.detail)}`);
  for (const wakeup of wakeups) lines.push(`Checks back at ${localTime(wakeup.due)}: ${wakeup.note.replace(/\s+/g, " ").trim()}`);
  if (wakeups.length > 0) lines.push(`Stopping the session's work cancels ${wakeups.length === 1 ? "it" : "them"}: ${stop}`);
  return lines.join("\n");
}

function renderItem(item: SessionItem): string[] {
  switch (item.type) {
    case "user":
      return ["you", ...indent(item.text), ...images(item.images)];
    case "assistant":
      return [`assistant${answerNote(item)}`, ...indent(item.text)];
    case "tool":
      return [
        `tool ${item.name} (${item.status})`,
        ...indent(item.args),
        ...indent(item.output.trimEnd()),
        ...images(item.images),
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

/** A line for each image, naming it by its media type. */
const images = (shown: readonly SessionImage[]): string[] => shown.map((image) => `  [image: ${image.mimeType}]`);

/** The lines of `text`, each indented two spaces; no lines for no text. */
export function indent(text: string): string[] {
  return text === "" ? [] : text.split("\n").map((line) => `  ${line}`);
}
