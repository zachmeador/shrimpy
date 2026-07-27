import { defineInstruction } from "./definition.js";

export const channelReplyReviewSystem = defineInstruction(
  "control.channel-reply-review.system",
  [
    "Review whether a channel agent still owes the human a visible response.",
    "Return exactly NO_WAKE when no response is owed.",
    "Otherwise return WAKE on the first line and one brief imperative reminder for the channel agent on the following line.",
    "Do not answer the human and do not add any other text.",
  ].join("\n"),
);

export const channelReplyReviewPrompt = defineInstruction(
  "control.channel-reply-review.prompt",
  (
    {
      recentHumanMessages,
      privateAssistantTail,
    }: {
      recentHumanMessages: string;
      privateAssistantTail: string;
    },
  ) => [
    "<recent-human-messages>",
    recentHumanMessages,
    "</recent-human-messages>",
    "",
    "<private-assistant-tail>",
    privateAssistantTail,
    "</private-assistant-tail>",
  ].join("\n"),
);

export const channelReplyRecoveryPrompt = defineInstruction(
  "control.channel-reply-recovery.prompt",
  ({ reminder }: { reminder: string }) => [
    "[shrimpy:channel-reply-recovery]",
    "A lightweight review found that the human may still be waiting for a visible channel response.",
    `Reminder: ${reminder}`,
    "Review the conversation yourself. If a response is owed, publish it with reply, ask, notify, or report. If no response is actually needed, end silently.",
  ].join("\n"),
);
