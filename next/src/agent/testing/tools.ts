import { fauxAssistantMessage, fauxToolCall, type Message, type Tool } from "@earendil-works/pi-ai";
import { getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import type { Script } from "./index.ts";

/** A tool call the scripted model makes. */
export interface ToolCall {
  name: string;
  args: Parameters<typeof fauxToolCall>[1];
}

/** What a tool answered the scripted model. */
export interface ToolAnswer {
  name: string;
  isError: boolean;
  text: string;
}

export interface ToolScript {
  readonly script: Script;
  /** What each tool answered, in the order they were called, for every turn that ended. */
  readonly answers: ToolAnswer[];
  /** The messages of every request the model was sent, oldest request first. */
  readonly requests: (readonly Message[])[];
}

/**
 * A scripted model that, for each message it is given, makes the calls listed
 * for that message in turn, one round each, and then ends the turn by writing
 * `final`. A message past the end of the list is just answered. Calls are named
 * `call-0`, `call-1` and so on for each message, so the same call ID comes
 * round again in the next turn, as it can with a real model.
 */
export function callingTools(turns: ToolCall[][], final = "Done."): ToolScript {
  const answers: ToolAnswer[] = [];
  const requests: (readonly Message[])[] = [];
  const script: Script = (messages) => {
    requests.push(messages);
    const turn = messages.filter((message) => message.role === "user").length - 1;
    const calls = turns[turn] ?? [];
    const results = resultsAfterLastUser(messages);
    const next = calls[results.length];
    if (next !== undefined) {
      return fauxAssistantMessage([fauxToolCall(next.name, next.args, { id: `call-${results.length}` })], {
        stopReason: "toolUse",
      });
    }
    answers.push(
      ...results.map((result) => ({
        name: result.toolName,
        isError: result.isError,
        text: result.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
      })),
    );
    return fauxAssistantMessage(final);
  };
  return { script, answers, requests };
}

/** The instructions a request gives the model: its system messages replayed into the one text they make. */
export const systemPromptOf = (messages: readonly Message[]): string => getCurrentSystemPrompt(messages);

/** The tools a request offers the model, in order. */
export const toolsOf = (messages: readonly Message[]): Tool[] => getCurrentTools(messages);

function resultsAfterLastUser(messages: readonly Message[]) {
  const results = [];
  for (const message of messages.toReversed()) {
    if (message.role === "user") break;
    if (message.role === "toolResult") results.unshift(message);
  }
  return results;
}
