/**
 * A no on purpose, thrown from deep inside an operation so that whatever is at
 * its edge can tell it from a failure and answer with its words. Its message is
 * the words, for a person, and says what to do.
 */
export class Refusal extends Error {
  constructor(words: string) {
    super(words);
    this.name = "Refusal";
  }
}

/** Refuse what is being done, with words for a person that say what to do. */
export function refuse(words: string): never {
  throw new Refusal(words);
}

/** Whether `error` is a no on purpose, as opposed to a failure. */
export function isRefusal(error: unknown): error is Refusal {
  return error instanceof Refusal;
}
