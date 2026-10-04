import type { AgentChange, ModelRef } from "@earendil-works/pi-durable";

/** What every session of the agent is configured with: what the home says, not what a session chose. */
export interface SessionDefaults {
  model: ModelRef;
  /** The directory a session's tools work in. */
  cwd: string;
}

/**
 * The change that makes a session follow the home. The agent's instructions are
 * prompt sections of the home-context extension and are not kept in a session,
 * so any that an earlier start stored there are cleared.
 */
export function agentChange(defaults: SessionDefaults): AgentChange {
  return { model: defaults.model, cwd: defaults.cwd, instructions: null };
}
