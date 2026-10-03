export interface Listeners<T> {
  /** Start telling `listener` about values. Returns what stops that. */
  add(listener: (value: T) => void): () => void;
  /** Tell every listener there is now. One that is added meanwhile hears the next value, not this one. */
  notify(value: T): void;
  /** Forget every listener. */
  clear(): void;
}

/**
 * Listeners to tell about values. A listener that throws is reported to
 * `onError` and does not stop the others or reach whoever is telling them.
 */
export function createListeners<T>(onError: (error: Error) => void): Listeners<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    add(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    notify(value) {
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
