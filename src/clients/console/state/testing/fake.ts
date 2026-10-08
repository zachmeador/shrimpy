import { createListeners } from "../../../../lib/listeners/index.ts";
import type { ConsoleState, Farewell, Model, SendResult } from "../index.ts";

/** A state that does nothing but remember what it was asked, for tests of what draws it and what its keys do. */
export interface FakeState extends ConsoleState {
  /** What was done to it, in order, such as "select scout" or "send hello". */
  readonly calls: string[];
  /** What it answers. */
  readonly answers: { send: SendResult; farewell: Farewell | undefined };
  /** Change the model the way the real state would after something happened, and tell whoever listens. */
  show(model: Model): void;
}

export function fakeState(initial: Model): FakeState {
  let model = initial;
  const listeners = createListeners<Model>(() => undefined);
  const calls: string[] = [];
  const answers: FakeState["answers"] = { send: { ok: true }, farewell: undefined };
  return {
    calls,
    answers,
    show(next) {
      model = next;
      listeners.notify(model);
    },
    model: () => model,
    subscribe: (listener) => listeners.add(listener),
    selectAgent: (name) => void calls.push(`select ${name}`),
    selectRoom: (id) => void calls.push(`room ${id}`),
    openThread: (threadId) => void calls.push(`open ${threadId}`),
    startThread: () => void calls.push("start"),
    switchLists: () => void calls.push("switch"),
    openSession: (address) => void calls.push(`watch ${address}`),
    back: () => void calls.push("back"),
    send(text) {
      calls.push(`send ${text}`);
      return Promise.resolve(answers.send);
    },
    readStatus() {
      calls.push("status");
      return Promise.resolve();
    },
    farewell: () => Promise.resolve(answers.farewell),
    close() {
      listeners.clear();
      return Promise.resolve();
    },
  };
}
