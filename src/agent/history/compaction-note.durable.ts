import type { Message } from "@earendil-works/pi-ai";
import { GenerationTask, hook } from "@earendil-works/pi-durable";

const COMPACTION_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const COMPACTION_SUFFIX = "\n</summary>";

/** Appended after a Pi compaction summary so the model knows pre-compaction history is still searchable. */
export const COMPACTION_REMINDER =
  '\n\nEarlier messages and tool outputs from before this compaction are still searchable: call history({ action: "search", query: "..." }) to find specific details, or history({ action: "read" }) to inspect entries right before compaction (see the shrimpy-chat skill for more).';

/**
 * Remind the model of `history` whenever its context carries a Pi compaction
 * summary. The added text is deterministic so prompt caching stays intact.
 */
export const compactionNoteHook = hook(GenerationTask, {
  beforeRequest({ messages }) {
    const next: Message[] = messages.map((message) => {
      if (message.role !== "user") return message;
      if (typeof message.content === "string") {
        return isCompactionText(message.content) ? { ...message, content: `${message.content}${COMPACTION_REMINDER}` } : message;
      }
      const content = message.content.map((block) =>
        block.type === "text" && isCompactionText(block.text)
          ? { ...block, text: `${block.text}${COMPACTION_REMINDER}` }
          : block,
      );
      return content.every((block, index) => block === message.content[index]) ? message : { ...message, content };
    });
    return next.every((message, index) => message === messages[index]) ? undefined : { messages: next };
  },
});

const isCompactionText = (text: string): boolean =>
  text.startsWith(COMPACTION_PREFIX) && text.endsWith(COMPACTION_SUFFIX);
