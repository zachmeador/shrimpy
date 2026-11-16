import {
  activityWords,
  endingWords,
  failureWords,
  imageWords,
  markerWords,
  modelWords,
  type SessionImage,
  type SessionItem,
  type SessionStatus,
  toolStatusWords,
  usageWords,
  wakeupWords,
} from "../../contracts/agent/index.ts";
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
  for (const wakeup of wakeups) lines.push(wakeupWords(wakeup, localTime(wakeup.due)));
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
        `tool ${item.name} (${toolStatusWords(item.status)})`,
        ...indent(item.args),
        ...indent(item.output.trimEnd()),
        ...images(item.images),
        ...item.notes.flatMap((note) => indent(`note: ${note}`)),
      ];
    case "marker":
      return [`-- ${markerWords(item.marker)} --`];
  }
}

function answerNote(item: Extract<SessionItem, { type: "assistant" }>): string {
  if (item.streaming) return " (answering)";
  const ended = endingWords(item.ended?.how);
  return ended === undefined ? "" : ` (${ended})`;
}

function renderStatus(status: SessionStatus): string {
  const model = status.model === null ? "no model" : modelWords(status.model);
  const parts = [activityWords(status.activity), model, usageWords(status.usage)];
  if (status.queued.length > 0) parts.push(`${status.queued.length} queued`);
  return parts.join(" · ");
}

/** A line for each image, naming it by its media type. */
const images = (shown: readonly SessionImage[]): string[] => shown.map((image) => `  ${imageWords(image.mimeType)}`);

/** The lines of `text`, each indented two spaces; no lines for no text. */
export function indent(text: string): string[] {
  return text === "" ? [] : text.split("\n").map((line) => `  ${line}`);
}
