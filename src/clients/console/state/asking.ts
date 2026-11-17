import type { AgentModels } from "../../../contracts/agent/index.ts";
import { nameKey, valueOf } from "../../../contracts/gateway/index.ts";
import { type AgentCalls, type AgentShown, Down, type Holding, problemOf } from "../network/index.ts";
import type { Holdings } from "./holdings.ts";
import type { Notice } from "./model.ts";
import { devicesOf, statusOf } from "./status.ts";
import type { Store } from "./store.ts";

/** How long the models an agent said it can use are kept before it is asked again. A list is narrowed by typing, and each key asks for the list. */
const MODELS_KEPT_MS = 10_000;
/** How long an agent is waited for to say its models. The editor asks for one list at a time, so one that never came would hold up every key after it. */
const MODELS_WAIT_MS = 3000;
/** How long taking back a device waits for the gateway. */
const TAKE_BACK_MS = 10_000;

/** What the person asks in a thread that the console answers itself: `/status`, `/devices` and taking a device back, and the models of the thread's agent. */
export interface Asking {
  readStatus(): Promise<void>;
  readDevices(): void;
  takeBack(written: string): Promise<void>;
  models(): Promise<AgentModels | undefined>;
  showModel(): Promise<void>;
}

export function createAsking(store: Store, held: Holdings, clock: () => number): Asking {
  // The models an agent said it can use, and when. A clock that only goes forward keeps them, so a changed system time cannot.
  let kept: { agent: string; at: number; models: AgentModels } | undefined;

  /**
   * The models the agent held as `agent` can use: what it said in the last few
   * seconds, or else what it says when asked. Undefined when it says nothing
   * in time, or refuses; that is not kept, so the next key asks again.
   */
  async function modelsOf(name: string, agent: Holding<AgentShown, AgentCalls>): Promise<AgentModels | undefined> {
    if (kept?.agent === name && performance.now() - kept.at < MODELS_KEPT_MS) return kept.models;
    const waiting = AbortSignal.timeout(MODELS_WAIT_MS);
    const answer = await agent.calls.models(waiting).catch(() => undefined);
    if (answer?.kind !== "done") return undefined;
    kept = { agent: name, at: performance.now(), models: answer.value };
    return answer.value;
  }

  return {
    async readStatus() {
      const model = store.model();
      const { where } = model;
      if (where.screen !== "thread") return;
      const current = store.readingStatus();
      const selected = held.agent();
      const asking = where.place.kind === "agent" && selected !== undefined && model.agent?.state === "up" ? selected : undefined;
      // The agent is asked which model is its default, when the thread's is not that one. It may not answer.
      const own = model.session?.status.ownModel === true;
      const models = own && asking !== undefined ? await modelsOf(asking.name, asking.held) : undefined;
      const now = store.model();
      const sessions = asking === undefined ? undefined : now.sessions;
      if (current()) store.set({ status: statusOf(now, sessions, clock(), models?.default) });
    },

    readDevices() {
      const model = store.model();
      if (model.where.screen !== "thread") return;
      store.readingStatus();
      store.set({ status: { at: clock(), about: { kind: "devices", devices: devicesOf(model) } } });
    },

    async takeBack(written) {
      const devices = devicesOf(store.model());
      // An ID or a label, whatever the case, as names are compared.
      const wanted = nameKey(written.trim());
      const byId = devices.filter((device) => nameKey(device.id) === wanted);
      const named = byId.length > 0 ? byId : devices.filter((device) => device.label !== null && nameKey(device.label) === wanted);
      if (named.length === 0) {
        store.say({ kind: "no-device", written: written.trim(), devices: devices.map((device) => device.label ?? device.id) });
        return;
      }
      const [device] = named;
      if (named.length > 1 || device === undefined) {
        store.say({ kind: "devices-alike", written: written.trim() });
        return;
      }
      try {
        const { gateway } = store.model();
        if (gateway.state === "down") throw new Down(gateway.why);
        valueOf(await held.roster.calls.takeBack(device.id, AbortSignal.timeout(TAKE_BACK_MS)));
      } catch (error) {
        store.say({ kind: "not-taken-back", problem: problemOf(error) });
        return;
      }
      const model = store.model();
      if (model.status?.about.kind === "devices") {
        const left = devicesOf(model).filter((each) => each.id !== device.id);
        store.set({ status: { at: clock(), about: { kind: "devices", devices: left } } });
      }
      store.say({ kind: "taken-back", device: device.label ?? device.id });
    },

    async models() {
      const model = store.model();
      const { where } = model;
      const asking = held.agent();
      if (where.screen !== "thread" || where.place.kind !== "agent" || asking === undefined || model.agent?.state !== "up") return undefined;
      return modelsOf(asking.name, asking.held);
    },

    async showModel() {
      const model = store.model();
      const { where } = model;
      const asking = held.agent();
      // A room's thread has no one agent whose model this could be, even when it was opened from an agent's screen.
      if (where.screen !== "thread" || where.place.kind !== "agent" || asking === undefined) return;
      const { thread: threadId } = where;
      // Where the person is changes while the agent is asked. What the agent said is for the thread it was asked in.
      const stillHere = (): boolean => {
        const now = store.model().where;
        return held.agent() === asking && now.screen === "thread" && now.thread === threadId;
      };
      const tell = (notice: Notice): void => {
        if (stillHere()) store.say(notice);
      };

      const status = model.agent;
      if (status?.state === "down") return tell({ kind: "model-not-shown", problem: { down: status.why } });
      const view = threadId === undefined ? undefined : model.session;
      if (view === undefined) return tell({ kind: "model-unstarted", defaultModel: (await modelsOf(asking.name, asking.held))?.default });
      const { model: used, ownModel } = view.status;
      // The default is worth asking for when the thread's model is not it.
      const defaultModel = ownModel ? (await modelsOf(asking.name, asking.held))?.default : undefined;
      tell({ kind: "model-is", model: used, own: ownModel, defaultModel });
    },
  };
}
