import type { ModelRef } from "@earendil-works/pi-durable";

/**
 * What every session of the agent is configured with: what the home says, not
 * what a session chose. The sessions keep the agent's, and its model changes
 * only when a reading of the home finds another. Whoever makes a session reads
 * it then, so a session made after that starts with the new model.
 */
export interface SessionDefaults {
  readonly model: ModelRef;
  /** The directory a session's tools work in. */
  readonly cwd: string;
}
