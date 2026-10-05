import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";

/** The words of an answer, without thinking or tool calls. */
export function assistantText(message: AssistantMessage): string {
  let text = "";
  for (const block of message.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}

/** The words of an answer entry, or nothing if the entry holds no answer. */
export function answerText(answer: EntryRecord | undefined): string {
  const message = answer?.model?.[0];
  return message?.role === "assistant" ? assistantText(message) : "";
}

/** What the engine says about why an input went unanswered, as text. */
export function describe(detail: unknown): string | null {
  if (detail === undefined || detail === null) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}
