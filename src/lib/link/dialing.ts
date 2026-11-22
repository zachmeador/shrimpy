/*
 * What every dial shares, from Node or from a browser: how long it waits for
 * the answer to its hello, and what it says when the answer doesn't come or
 * can't be read. `where` is the other end as a person reads it.
 */

/** How long a dial waits for the answer, from when dialing starts, unless it is told otherwise. */
export const ANSWER_MS = 15_000;

export const didNotAnswer = (where: string, ms: number): Error =>
  new Error(`${where} did not answer within ${String(ms / 1000)} seconds.`);

export const closedBeforeAnswering = (where: string): Error => new Error(`${where} closed the connection before it answered.`);

/** The answer in the first frame `where` sent, which is JSON text, or an error that says what it was instead: `text` is undefined for a binary frame. */
export function answerIn(where: string, text: string | undefined): unknown {
  if (text === undefined) throw new Error(`${where} answered with something other than a hello's answer.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${where} answered with something other than JSON.`);
  }
}
