import type { Pigment } from "../contracts/agent/index.ts";
import { type FollowAttach, follow } from "../lib/follow/index.ts";
import { createListeners } from "../lib/listeners/index.ts";

/** What the home says of how the agent looks. */
export interface Look {
  /** The twelve lines of the sigil its `agent.json` has, or null when it has none that is a sigil. */
  readonly sigil: string[] | null;
  /** The pigment its `agent.json` names, or null when it names none. */
  readonly pigment: Pigment | null;
}

/** How the agent looks, as it last read it from its home, kept live for its `Agent` object. */
export interface KeptLook {
  readonly sigil: FollowAttach<string[] | null>;
  readonly pigment: FollowAttach<Pigment | null>;
  /** What it has now. */
  now(): Look;
  /** Keep what a reading of the home found. Whoever follows the sigil or the pigment hears what changed. */
  take(look: Look): void;
}

/** Nothing until the first reading of the home, which comes before the agent serves anything. */
export function keepLook(onError: (error: Error) => void): KeptLook {
  let kept: Look = { sigil: null, pigment: null };
  const changes = createListeners<undefined>(onError);
  const watch = (changed: () => void): (() => void) => changes.add(changed);
  return {
    sigil: follow({ read: () => kept.sigil, watch }),
    pigment: follow({ read: () => kept.pigment, watch }),
    now: () => kept,
    take(look) {
      kept = look;
      changes.notify(undefined);
    },
  };
}
