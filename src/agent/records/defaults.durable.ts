import type { AgentChange, ModelRef } from "@earendil-works/pi-durable";

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

/**
 * The change that makes a session follow the home: its model and where its
 * tools work. The agent's instructions are not part of it. They are prompt
 * sections of the home-context extension, the same for every session.
 */
export function agentChange(defaults: SessionDefaults): AgentChange {
  return { model: defaults.model, cwd: defaults.cwd };
}
