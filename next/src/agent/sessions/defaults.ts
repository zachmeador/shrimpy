import type { AgentChange, ModelRef } from "@earendil-works/pi-durable";

/** What every session of the agent is configured with: what the home says, not what a session chose. */
export interface SessionDefaults {
  model: ModelRef;
  /** The agent's own instructions, when it has any. */
  instructions?: string;
  /** The directory a session's tools work in. */
  cwd: string;
}

/** The change that makes a session follow the home. Instructions the home no longer has are cleared. */
export function agentChange(defaults: SessionDefaults): AgentChange {
  return { model: defaults.model, cwd: defaults.cwd, instructions: defaults.instructions ?? null };
}
