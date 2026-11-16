import { ChordError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context, withAbortSignal } from "@earendil-works/chord/context";
import { refuse } from "../../lib/refusal/index.ts";
import type { Answer, Refused } from "./answers.ts";

/** The context a call on another program's object runs in: aborted by `signal`, when there is one. */
export const contextOf = (signal?: AbortSignal): Context =>
  signal === undefined ? BACKGROUND_CONTEXT : withAbortSignal(signal, BACKGROUND_CONTEXT);

/** What a method did, or its refusal, thrown as a `Refusal` with its words. */
export function valueOf<T>(answer: Answer<T>): T {
  if (answer.kind === "refused") refuse(answer.words);
  return answer.value;
}

/** Throw the refusal an object is held with, as a `Refusal` with its words, if it has one. */
export function unlessRefused(refusal: Refused | null): void {
  if (refusal !== null) refuse(refusal.words);
}

/** Whether `error` is a call that failed because its link dropped, or because the program it went to went away. */
export function isLost(error: unknown): boolean {
  return error instanceof ChordError && (error.code === "unavailable" || error.code === "released");
}

/** Run `work` on the object `get` gives, for as long as it runs, and let go of it then. */
export async function holding<T, O extends { release(): void }>(get: Promise<O>, work: (held: O) => Promise<T> | T): Promise<T> {
  const held = await get;
  try {
    return await work(held);
  } finally {
    held.release();
  }
}
