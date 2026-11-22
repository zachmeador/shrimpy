import { createListeners } from "../../lib/listeners/index.ts";
import type { Model, Notice } from "./model.ts";

/** The model as it stands, changed in one way, and whoever is told of each change. */
export interface Store {
  model(): Model;
  /** Tell `listener` after each change. Returns what stops that. */
  subscribe(listener: (model: Model) => void): () => void;
  /**
   * Change the model, work in what the held objects show and what follows from
   * it, and tell whoever listens, once. Opening anything, the thread that is
   * open included, ends what `/status` read, which is for the thread it was read
   * in as the person found it.
   */
  set(patch: Partial<Model>): void;
  /** Work in what the held objects show, once for all the changes of one turn of the event loop. */
  changed(): void;
  /** Tell the person something in a notice that goes away by itself, or take the notice away. */
  say(notice: Notice | undefined): void;
  /** Begin reading what `/status` or `/devices` shows, and drop a reading still on its way. The answer says whether this one is still the latest. */
  readingStatus(): () => boolean;
  /** End what `/status` read, and drop a reading still on its way, as a message that is sent does. */
  endStatus(): void;
  /** Tell nobody anything more. */
  close(): void;
}

export interface StoreOptions {
  /** How long a notice stays, in milliseconds. */
  noticeMs: number;
  /** The model with what the held objects show worked in. */
  worked(model: Model): Model;
  /** Do what follows from the model as it now stands. What it changes is worked in before anyone is told. */
  follow(): void;
}

export function createStore(initial: Model, options: StoreOptions): Store {
  const listeners = createListeners<Model>(() => undefined);
  let model = initial;
  let closed = false;
  // Counts the readings of `/status` that were asked for or dropped, so that one still on its way when the person moves on or sends a message is not shown.
  let statusReads = 0;
  // What changed in the objects held is worked into the model once for all the changes of one turn of the event loop.
  let scheduled = false;
  // A change made while the model is worked out, as landing on the only agent is, is worked in before anyone is told.
  let refreshing = false;
  let asked = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Work what the held objects show into the model, with what follows from it, and tell whoever listens, once. */
  function refresh(): void {
    if (closed) return;
    asked += 1;
    if (refreshing) return;
    refreshing = true;
    try {
      let done: number;
      do {
        done = asked;
        scheduled = false;
        model = options.worked(model);
        options.follow();
      } while (asked !== done);
    } finally {
      refreshing = false;
    }
    listeners.notify(model);
  }

  const store: Store = {
    model: () => model,
    subscribe: (listener) => listeners.add(listener),
    set(patch) {
      if (closed) return;
      const moved = patch.open !== undefined;
      if (moved) statusReads += 1;
      model = { ...model, ...(moved ? { status: undefined } : {}), ...patch };
      refresh();
    },
    changed() {
      if (scheduled || closed) return;
      scheduled = true;
      queueMicrotask(() => {
        if (scheduled) refresh();
      });
    },
    say(notice) {
      clearTimeout(noticeTimer);
      store.set({ notice });
      if (notice !== undefined) noticeTimer = setTimeout(() => store.set({ notice: undefined }), options.noticeMs);
    },
    readingStatus() {
      statusReads += 1;
      const read = statusReads;
      return () => read === statusReads;
    },
    endStatus() {
      statusReads += 1;
      if (model.status !== undefined) store.set({ status: undefined });
    },
    close() {
      closed = true;
      clearTimeout(noticeTimer);
      listeners.clear();
    },
  };
  return store;
}
