import type { ModelId } from "../../contracts/agent/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Admissions } from "./admissions.ts";

/** What the words after `/model` ask for. */
export type ModelAsk =
  /** Nothing: say which model the thread runs on. */
  | { kind: "show" }
  /** `default`: follow the agent's default model again. */
  | { kind: "default" }
  /** A model written as its provider, a slash and its ID. */
  | { kind: "use"; model: ModelId }
  /** Anything else, which names no model. */
  | { kind: "unclear" };

/** What `/model` is written with to have a thread follow the agent's default model again. */
const DEFAULT = "default";

/**
 * What the words after `/model` ask for. An ID may have slashes of its own, as
 * a model of a router has, and a provider has none, so the first slash divides
 * them.
 */
export function modelAskOf(words: string): ModelAsk {
  if (words === "") return { kind: "show" };
  if (words.toLowerCase() === DEFAULT) return { kind: "default" };
  const slash = words.indexOf("/");
  if (/\s/.test(words) || slash <= 0 || slash === words.length - 1) return { kind: "unclear" };
  return { kind: "use", model: { provider: words.slice(0, slash), id: words.slice(slash + 1) } };
}

const UNCLEAR =
  "Write /model provider/id to choose a model for this thread, or /model default to follow my default model again. /model alone says which model the thread runs on.";

const written = (model: ModelId): string => `${model.provider}/${model.id}`;
const same = (a: ModelId, b: ModelId): boolean => a.provider === b.provider && a.id === b.id;

/**
 * What a person's `/model` does in a thread, and the one line the agent says
 * about it there. The session behind the thread is made to use the model from
 * its next request, or to follow the agent's default model again, and the line
 * says which model the thread runs on now and which it ran on before, or that
 * nothing changed because it already ran on that one. A model the agent can't
 * use is answered with why, in the words of the agent's refusal, which say which
 * it can use, and the thread keeps the model it had. With nothing after it,
 * `/model` says which model the thread runs on and which is the agent's
 * default, and changes nothing.
 */
export async function actOnModel(admissions: Admissions, thread: { threadId: string; channelId: string }, words: string): Promise<string> {
  const ask = modelAskOf(words);
  if (ask.kind === "unclear") return UNCLEAR;
  if (ask.kind === "show") {
    const { used, home } = await admissions.modelOf(thread.threadId);
    return same(used, home)
      ? `This thread runs on ${written(used)}, my default model.`
      : `This thread runs on ${written(used)}. My default model is ${written(home)}.`;
  }
  try {
    const { before, now } = await admissions.useModel(thread, ask.kind === "default" ? null : ask.model);
    return same(before, now)
      ? `Nothing changed: this thread already runs on ${written(now)}.`
      : `This thread runs on ${written(now)} now. Before, it ran on ${written(before)}.`;
  } catch (error) {
    if (isRefusal(error)) return error.message;
    throw error;
  }
}
