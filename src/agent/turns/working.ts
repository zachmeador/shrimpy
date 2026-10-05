/** What the agent's sessions know of the inputs it took up and has not finished telling their sources about yet. */
export interface Working {
  /** The threads those inputs are in. A session behind no thread is in none. */
  threads(): Promise<ReadonlySet<string>>;
  /** Call `listener` after the answer to `threads()` may have changed. Returns what stops that. */
  onChange(listener: () => void): () => void;
  /** Resolve once every input whose turn has ended has been told to its source, or `signal` aborts. A turn still running is not waited for. */
  untilTold(signal: AbortSignal): Promise<void>;
}
