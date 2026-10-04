/**
 * Make `step` run until nothing has asked for it since it last started. A
 * request that comes while it runs is not lost and does not start a second run
 * beside the first: it makes the same run go once more. `step` looks at what is
 * wanted and what is so, and moves one step towards it. A step that fails is
 * reported to `onError` and ends the run. The result settles when the run ends,
 * and never rejects.
 */
export function converge(step: () => Promise<void>, onError: (error: unknown) => void): () => Promise<void> {
  let running: Promise<void> | undefined;
  let again = false;
  // Read through a function: it changes while `step` runs, which the compiler cannot see.
  const asked = (): boolean => again;
  return () => {
    if (running !== undefined) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await step();
        } while (asked());
      } catch (error) {
        onError(error);
      } finally {
        running = undefined;
      }
    })();
    return running;
  };
}
