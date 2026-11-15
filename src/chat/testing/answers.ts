import type { Answer, Refused } from "../../contracts/gateway/index.ts";

/** The refusal a method answered with, or a failure when it did what was asked. */
export function refusalOf(answer: Answer<unknown>): Refused {
  if (answer.kind === "done") throw new Error(`Done, and not refused: ${JSON.stringify(answer.value)}`);
  return answer;
}
