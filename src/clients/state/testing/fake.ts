import type { AgentModel } from "../../../contracts/agent/index.ts";
import { createListeners } from "../../../lib/listeners/index.ts";
import type { ClientState, Farewell, Model } from "../index.ts";

/** A state that does nothing but remember what it was asked, for tests of what draws it and what its keys do. */
export interface FakeState extends ClientState {
  /** What was done to it, in order, such as "select scout", "write hello" or "note no-command". */
  readonly calls: string[];
  /** What it answers. */
  readonly answers: { write: boolean; send: boolean; farewell: Farewell | undefined; models: AgentModel[] | undefined };
  /** Change the model the way the real state would after something happened, and tell whoever listens. */
  show(model: Model): void;
}

export function fakeState(initial: Model): FakeState {
  let model = initial;
  const listeners = createListeners<Model>(() => undefined);
  const calls: string[] = [];
  const answers: FakeState["answers"] = { write: true, send: true, farewell: undefined, models: undefined };
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
    selectReadOnly: (id) => void calls.push(`read-only ${id}`),
    openThread: (threadId) => void calls.push(`open ${threadId}`),
    startThread: (place) => void calls.push(place === undefined ? "start" : `start in ${place.kind} ${place.id}`),
    turnOver: () => void calls.push("turn over"),
    showView: (agent) => void calls.push(`show view ${agent}`),
    openSession: (address) => void calls.push(`watch ${address}`),
    look: () => undefined,
    joinRoom() {
      calls.push("join");
      return Promise.resolve();
    },
    write(text) {
      calls.push(`write ${text}`);
      return Promise.resolve(answers.write);
    },
    send(text) {
      calls.push(`send ${text}`);
      return Promise.resolve(answers.send);
    },
    rename(typed) {
      calls.push(`rename ${typed}`);
      return Promise.resolve();
    },
    archive(archived) {
      calls.push(archived ? "archive" : "unarchive");
      return Promise.resolve();
    },
    note: (notice) => void calls.push(`note ${notice.kind}`),
    readStatus: () => void calls.push("status"),
    readDevices: () => void calls.push("devices"),
    takeBack(written) {
      calls.push(`take back ${written}`);
      return Promise.resolve();
    },
    models: () => Promise.resolve(answers.models),
    showModel: () => void calls.push("model"),
    folder(path) {
      calls.push(`folder ${path}`);
      return Promise.resolve({ value: [] });
    },
    file(path) {
      calls.push(`file ${path}`);
      return Promise.resolve({ value: { kind: "text", text: "" } });
    },
    trigger(name) {
      calls.push(`trigger ${name}`);
      return Promise.resolve({ problem: { down: { kind: "not-linked" } } });
    },
    farewell: () => answers.farewell,
    close() {
      listeners.clear();
      return Promise.resolve();
    },
  };
}
