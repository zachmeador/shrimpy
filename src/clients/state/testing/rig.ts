import type { TestContext } from "node:test";
import type { Member, Thread } from "../../../contracts/chat/index.ts";
import { memberNamed, type Speaking, speakingAs, startTestChat, type TestChat } from "../../../contracts/chat/testing/index.ts";
import { gatewaySocket } from "../../../contracts/gateway/node.ts";
import { linkTestAgent, startTestGateway, type TestAgent, type TestGateway } from "../../../contracts/gateway/testing/index.ts";
import { backoff } from "../../../lib/retry/index.ts";
import { eventually, stopAfter, useRuntimeDir } from "../../../lib/testing/index.ts";
import { dialAt } from "../../console/dial/index.ts";
import { type ClientState, createClientState, type Model } from "../index.ts";

export interface RigOptions {
  /** The agents to link to the gateway, by name: each is on the roster and linked, and serves nothing but its presence. Scout by default. */
  agents?: string[];
  /** Start no gateway, and so no agent: the test starts them. */
  noGateway?: boolean;
  /** How long a notice stays, in milliseconds. */
  noticeMs?: number;
  /** How long sending waits for the chat server, in milliseconds. */
  sendMs?: number;
  /** The moment it is, for saying when `/status` read what it shows. */
  now?: () => number;
}

/** The real gateway and chat server, small agents' programs linked to the gateway, and a console state holding what they serve. */
export interface Rig {
  readonly state: ClientState;
  readonly chat: TestChat;
  /** The gateway, once there is one. */
  gateway(): Promise<TestGateway>;
  /** The agents' programs, by name. */
  readonly agents: Record<string, TestAgent>;
  /** The state's model when `done` accepts it, from now or as it changes. */
  until(done: (model: Model) => boolean, what: string): Promise<Model>;
  /** You, as a member of chat, linked to the gateway apart from the console. */
  person(): Promise<Speaking>;
  /** An agent, as a member of chat, through its program's link, which keeps the marks it sets. */
  asAgent(agent: string): Promise<Speaking>;
  /** An agent as the roster has it. */
  member(agent: string): Promise<Member>;
  /** The person's DM with an agent, made if need be: its channel and its main thread. */
  dm(agent: string): Promise<{ channelId: string; main: Thread }>;
  /** A thread in the person's DM with an agent, made as if the person had started it, with a first message. */
  thread(agent: string, firstMessage: string): Promise<Thread>;
}

/** Everything is running before the state starts, so a test sees the console meeting what is already there. */
export async function startRig(t: TestContext, options: RigOptions = {}): Promise<Rig> {
  useRuntimeDir(t);
  const chat = await startTestChat(t);
  const agents: Record<string, TestAgent> = {};
  if (options.noGateway !== true) {
    await startTestGateway(t);
    for (const name of options.agents ?? ["scout"]) agents[name] = await linkTestAgent(t, name);
    // The console meets a chat server that is linked already.
    const person = await (await startTestGateway(t)).connect();
    await speakingAs(t, person);
  }

  const state = await createClientState({
    dial: dialAt({ path: gatewaySocket() }),
    token: null,
    backoff: backoff({ firstMs: 1, maxMs: 8, random: () => 0 }),
    ...(options.noticeMs === undefined ? {} : { noticeMs: options.noticeMs }),
    ...(options.sendMs === undefined ? {} : { sendMs: options.sendMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  stopAfter(t, () => state.close());

  let person: Promise<Speaking> | undefined;
  const speakers = new Map<string, Promise<Speaking>>();
  const program = (agent: string): TestAgent => {
    const found = agents[agent];
    if (found === undefined) throw new Error(`The rig has no agent called ${agent}.`);
    return found;
  };
  const rig: Rig = {
    state,
    chat,
    gateway: () => startTestGateway(t),
    agents,
    until: (done, what) => eventually(() => state.model(), done, { what }),
    person: () => (person ??= startTestGateway(t).then((gateway) => gateway.connect()).then((client) => speakingAs(t, client))),
    asAgent(agent) {
      let speaking = speakers.get(agent);
      if (speaking === undefined) {
        speaking = speakingAs(t, program(agent));
        speakers.set(agent, speaking);
      }
      return speaking;
    },
    member: (agent) => memberNamed(t, agent),
    async dm(agent) {
      const you = await rig.person();
      const channel = await you.openDm((await rig.member(agent)).id);
      const main = (await you.threads(channel.id)).find((each) => each.main);
      if (main === undefined) throw new Error(`The DM ${channel.id} has no main thread.`);
      return { channelId: channel.id, main };
    },
    async thread(agent, firstMessage) {
      const you = await rig.person();
      const made = await you.createThread((await rig.dm(agent)).channelId, null);
      await you.post(made.id, firstMessage);
      return made;
    },
  };
  return rig;
}
