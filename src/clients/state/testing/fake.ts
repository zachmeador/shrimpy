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
    openFrom: (agentId, threadId) => void calls.push(`open from ${agentId} ${threadId}`),
    closeItem: () => void calls.push("close"),
    startThread: (place) => void calls.push(place === undefined ? "start" : `start in ${place.kind} ${place.id}`),
    turnOver: () => void calls.push("turn over"),
    showView: (agent) => void calls.push(`show view ${agent}`),
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
    readFolder: (path) => void calls.push(`folder ${path}`),
    readFile: (path) => void calls.push(`file ${path}`),
    readPage: (folders) => void calls.push(`page ${[...folders].join(" ")}`.trimEnd()),
    followProcessOutput(agentId, procId) {
      calls.push(`process output ${agentId} ${procId}`);
      return () => void calls.push(`stop process output ${agentId} ${procId}`);
    },
    killProcess(agentId, procId) {
      calls.push(`kill ${agentId} ${procId}`);
      return Promise.resolve();
    },
    cancelWatch(agentId, watchId) {
      calls.push(`cancel watch ${agentId} ${watchId}`);
      return Promise.resolve();
    },
    cancelTrigger(agentId, triggerId) {
      calls.push(`cancel trigger ${agentId} ${triggerId}`);
      return Promise.resolve();
    },
    fireTrigger(agentId, name) {
      calls.push(`fire ${agentId} ${name}`);
      return Promise.resolve();
    },
    switchTrigger(agentId, name, on) {
      calls.push(`switch ${agentId} ${name} ${on ? "on" : "off"}`);
      return Promise.resolve();
    },
    stopSession(agentId) {
      calls.push(`stop session ${agentId}`);
      return Promise.resolve();
    },
    farewell: () => answers.farewell,
    close() {
      listeners.clear();
      return Promise.resolve();
    },
  };
}
