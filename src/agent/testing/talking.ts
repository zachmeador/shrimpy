import { fauxAssistantMessage, fauxText, fauxToolCall, type Message } from "@earendil-works/pi-ai";
import type { Script } from "./index.ts";

/**
 * What a scripted model does in one turn: send a message along the way, or ask
 * another agent a question, if it says to, then end the turn with `final`. A turn
 * does one or the other.
 */
export interface Turn {
  send?: { text: string; to?: string };
  ask?: { to: string; text: string; within?: string };
  final: string;
}

/** A scripted model that records what it is shown, and the turns it has had. */
export interface Talking {
  readonly script: Script;
  /** What the model was shown at the start of each turn, oldest first: everything it was given since it last answered. */
  readonly shown: string[];
}

/** The text of a user message, whatever shape the engine gives it. */
function textOf(message: Message): string {
  if (message.role !== "user") return "";
  return typeof message.content === "string" ? message.content : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/** Everything the model was shown since it last answered, oldest first. */
export function shownSinceLastAnswer(messages: readonly Message[]): string {
  const answered = messages.findLastIndex((message) => message.role === "assistant");
  return messages.slice(answered + 1).map(textOf).join("\n");
}

/**
 * A scripted model that, at the start of each turn, is told what it was shown
 * and what turn it is, and answers by `respond`: a message to send along the
 * way, if any, and the text that ends the turn.
 */
export function talking(respond: (shown: string, turn: number) => Turn): Talking {
  const shown: string[] = [];
  let current: Turn = { final: "" };
  const script: Script = (messages) => {
    if (messages.at(-1)?.role !== "toolResult") {
      shown.push(shownSinceLastAnswer(messages));
      current = respond(shown.at(-1) ?? "", shown.length - 1);
      if (current.send !== undefined) {
        const { text, to } = current.send;
        const args: Record<string, string> = to === undefined ? { text } : { text, to };
        return fauxAssistantMessage([fauxToolCall("send_message", args, { id: `call-${String(shown.length)}` })], { stopReason: "toolUse" });
      }
      if (current.ask !== undefined) {
        return fauxAssistantMessage([fauxToolCall("ask_agent", current.ask, { id: `call-${String(shown.length)}` })], { stopReason: "toolUse" });
      }
    }
    return fauxAssistantMessage([fauxText(current.final)]);
  };
  return { script, shown };
}
