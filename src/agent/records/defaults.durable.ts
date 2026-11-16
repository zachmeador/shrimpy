import type { ModelRef } from "@earendil-works/pi-durable";

/**
 * What every session of the agent is configured with: what the home says, not
 * what a session chose. Whoever makes sessions shares one of these, so the
 * agent changes `model` here when it reloads and finds the home naming another,
 * and a session made after that starts with it.
 */
export interface SessionDefaults {
  model: ModelRef;
  /** The directory a session's tools work in. */
  cwd: string;
}
