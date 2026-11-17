/**
 * Closing what was opened, the last first, so that each thing closes before
 * what it was opened on, and every one is closed even when one before it
 * fails. It must not know what is closed. Safe for browsers.
 */

/** What was opened, kept to be closed. */
export interface Opened {
  /** Keep `close`, to be run when everything is closed. */
  add(close: () => void | Promise<void>): void;
  /**
   * Run everything kept, the last first, and forget it. A close that fails
   * doesn't stop the rest. One failure is thrown as it is, and more than one
   * together.
   */
  closeAll(): Promise<void>;
}

/** Nothing opened yet. `failed` is the message of the error that holds the failures when more than one close fails. */
export function opening(failed: string): Opened {
  const closes: (() => void | Promise<void>)[] = [];
  return {
    add: (close) => void closes.push(close),
    async closeAll() {
      const errors: unknown[] = [];
      for (const close of closes.splice(0).reverse()) {
        try {
          await close();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, failed);
    },
  };
}
