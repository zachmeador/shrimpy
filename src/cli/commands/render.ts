import {
  activityWords,
  endingWords,
  failureWords,
  imageWords,
  markerWords,
  modelWords,
  onceTriggerPrompt,
  type SessionImage,
  type SessionItem,
  type SessionStatus,
  toolStatusWords,
  usageWords,
} from "../../contracts/agent/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { localTime } from "../../lib/time/index.ts";

/** A session whole: every item, oldest first, and what it is doing now. */
export interface WholeSession {
  items: SessionItem[];
  status: SessionStatus;
}

/**
 * A session as text for a person: each item under a label, then one line of
 * status, then why its last turn ended without an answer, and any running
 * background processes, open watches, or pending one-shot triggers in its
 * thread.
 */
export function renderSession(view: WholeSession): string {
  const lines: string[] = [];
  for (const item of view.items) lines.push(...renderItem(item), "");
  lines.push(renderStatus(view.status));
  const { failure, processes, watches, onceTriggers } = view.status;
  if (failure !== null) lines.push(`Last turn: ${failureWords(failure.reason, failure.detail)}`);
  for (const proc of processes) lines.push(`Running ${proc.id}: $ ${oneLine(proc.command)} (since ${localTime(proc.startedAt)})`);
  for (const watch of watches) lines.push(`Waiting on @${oneLine(watch.onAgentName)} in ${watch.toThread} (since ${localTime(watch.startedAt)})`);
  for (const trig of onceTriggers) lines.push(`Once at ${localTime(trig.due)}: ${onceTriggerPrompt(trig)}`);
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

const images = (shown: readonly SessionImage[]): string[] => shown.map((image) => `  ${imageWords(image.mimeType)}`);

export function indent(text: string): string[] {
  return text === "" ? [] : text.split("\n").map((line) => `  ${line}`);
}
