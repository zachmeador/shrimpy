import type { FollowAttach } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { diffRevisions } from "@earendil-works/chord/delta";
import type { JsonValue } from "@earendil-works/chord/json";

/** A value worked out from things that tell when they change. */
export interface Followed<T> {
  /** Work the value out. It may take its time. */
  read(): T | Promise<T>;
  /** Start being told when something the value is worked out from may have changed. Returns what stops that. */
  watch(changed: () => void): () => void;
}

/**
 * What Chord's `self.follow` takes for a value `followed` works out: it is read
 * when the object attaches, and again whenever `followed` says something may
 * have changed, one reading at a time, with one more after a reading that a
 * change came during. Followers are told only what changed, as Chord's ops. A
 * reading that fails after the first ends the source as failed, which Chord
 * answers by attaching again. Nothing polls.
 */
export function follow<T extends JsonValue>(followed: Followed<T>): FollowAttach<T> {
  return async (observer) => {
    // Read through functions: each changes while a reading is under way.
    const state = { detached: false, reading: true, changed: false };
    const detached = (): boolean => state.detached;
    const changed = (): boolean => state.changed;
    // Watched before the first reading, so a change while it reads is not missed. The first reading counts as one
    // under way, so a change during it waits for it.
    const stop = followed.watch(() => {
      state.changed = true;
      if (!state.reading && !detached()) void reread();
    });
    let current: T;
    try {
      current = await followed.read();
    } catch (error) {
      stop();
      throw error;
    } finally {
      state.reading = false;
    }

    async function reread(): Promise<void> {
      state.reading = true;
      try {
        while (changed() && !detached()) {
          state.changed = false;
          const next = await followed.read();
          if (detached()) return;
          const ops = diffRevisions(current, next);
          if (ops.length === 0) continue;
          current = next;
          observer.advance({ kind: "value", value: next, ops, retired: false }, BACKGROUND_CONTEXT);
        }
      } catch (error) {
        if (detached()) return;
        state.detached = true;
        stop();
        observer.end({ kind: "failed", error });
      } finally {
        state.reading = false;
      }
    }

    // A change that came while the first reading was under way is read again now.
    if (changed()) void reread();
    return {
      value: current,
      detach() {
        state.detached = true;
        stop();
      },
    };
  };
}
