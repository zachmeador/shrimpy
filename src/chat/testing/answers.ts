import type { Answer, Refused } from "../../contracts/gateway/index.ts";

/** What a method did, or a failure that says what it refused. */
export function valueOf<T>(answer: Answer<T>): T {
  if (answer.kind === "refused") throw new Error(`Refused: ${answer.words}`);
  return answer.value;
}

/** The refusal a method answered with, or a failure when it did what was asked. */
export function refusalOf(answer: Answer<unknown>): Refused {
  if (answer.kind === "done") throw new Error(`Done, and not refused: ${JSON.stringify(answer.value)}`);
  return answer;
}
