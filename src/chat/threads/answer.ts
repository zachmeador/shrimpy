import { type Answer, done, refused } from "../../contracts/gateway/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";

/** Run `work` and answer with what it gave, or with the refusal it threw, as the contract's refusal. Anything else it throws, it throws. */
export function answer<T>(work: () => T): Answer<T> {
  try {
    return done(work());
  } catch (error) {
    if (isRefusal(error)) return refused(error.message);
    throw error;
  }
}
