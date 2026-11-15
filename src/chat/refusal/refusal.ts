import { type Answer, done, type Refused, refused } from "../../contracts/gateway/index.ts";

/** A refusal on its way to the edge of the operation that made it. */
class Refusal extends Error {
  readonly refused: Refused;

  constructor(refusal: Refused) {
    super(refusal.words);
    this.name = "Refusal";
    this.refused = refusal;
  }
}

/** Refuse what is being done, with words for a person that say what to do, or with a refusal made elsewhere. */
export function refuse(words: string | Refused): never {
  throw new Refusal(typeof words === "string" ? refused(words) : words);
}

/** Run `work` and answer with what it gave, or with the refusal it threw. Anything else it throws, it throws. */
export function answer<T>(work: () => T): Answer<T> {
  try {
    return done(work());
  } catch (error) {
    if (error instanceof Refusal) return error.refused;
    throw error;
  }
}
