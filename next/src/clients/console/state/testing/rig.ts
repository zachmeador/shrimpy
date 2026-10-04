import type { TestContext } from "node:test";
import { type StandInAgent, startStandInAgent } from "../../../../contracts/agent/testing/index.ts";
import { agentMember, type ChatConnection, type Thread } from "../../../../contracts/chat/index.ts";
import { scriptedChat, type StandInChat, startStandInChat } from "../../../../contracts/chat/testing/index.ts";
import { type StandInGateway, startStandInGateway } from "../../../../contracts/gateway/testing/index.ts";
import { backoff } from "../../../../lib/retry/index.ts";
import { eventually, stopAfter, useRuntimeDir } from "../../../../lib/testing/index.ts";
import { localTransports, type Transports } from "../../network/index.ts";
import { type ConsoleState, createConsoleState, type Model } from "../index.ts";
import { zach } from "./data.ts";

const me = zach;

export interface RigOptions {
  /** The agents to run, by name. Each is registered with the gateway. Scout by default. */
  agents?: string[];
  /** The version of Shrimpy the agents say they run. The version of Shrimpy by default. */
  agentVersion?: string;
  /** Run no chat server. */
  noChat?: boolean;
  /** Run no gateway. */
  noGateway?: boolean;
  /** How the console reaches what is running, given the way to this machine's sockets. */
  transports?: (local: Transports) => Transports;
  /** How long a notice stays, in milliseconds. */
  noticeMs?: number;
}

/** A gateway, a chat server and agents as stand-ins on real sockets, and a console state talking to them. */
export interface Rig {
  readonly state: ConsoleState;
  readonly gateway: StandInGateway | undefined;
  readonly chat: StandInChat;
  readonly agents: Record<string, StandInAgent>;
  /** The state's model when `done` accepts it, from now or as it changes. */
  until(done: (model: Model) => boolean, what: string): Promise<Model>;
  /** The person's DM with an agent, made if need be: its channel and its main thread. */
  dm(agent: string): { channelId: string; main: Thread };
  /** A thread in the person's DM with an agent, made as if the person had started it, with a first message. */
  thread(agent: string, firstMessage: string): Promise<Thread>;
  /** Connect to the chat server as an agent does, to work in a thread. Closed when the test ends. */
  asAgent(agent: string): Promise<ChatConnection>;
}

/** Everything is running before the state starts, so a test sees the console meeting what is already there. */
export async function startRig(t: TestContext, options: RigOptions = {}): Promise<Rig> {
  useRuntimeDir(t);
  const gateway = options.noGateway === true ? undefined : await startStandInGateway(t);
  // Every moment the chat stamps is a second after the last, so threads come in the order they were made.
  let clock = Date.parse("2026-10-03T12:00:00Z");
  const chat = await startStandInChat(t, {
    chat: scriptedChat({ now: () => (clock += 1000) }),
    register: options.noChat !== true,
  });
  const agents: Record<string, StandInAgent> = {};
  for (const name of options.agents ?? ["scout"]) agents[name] = await startStandInAgent(t, { name, register: true, version: options.agentVersion });

  const local = localTransports();
  const state = createConsoleState({
    me,
    transports: options.transports?.(local) ?? local,
    pollMs: 15,
    noticeMs: options.noticeMs,
    backoff: backoff({ firstMs: 1, maxMs: 8, random: () => 0 }),
  });
  stopAfter(t, () => state.close());

  const dm = (agent: string): { channelId: string; main: Thread } => {
    const found = chat.chat.dm(me, agentMember(agent));
    return { channelId: found.channel.id, main: found.thread };
  };
  return {
    state,
    gateway,
    chat,
    agents,
    until: (done, what) => eventually(() => state.model(), done, { what }),
    dm,
    async thread(agent, firstMessage) {
      const person = await chat.join(me);
      const made = await person.chat.createThread(dm(agent).channelId, null);
      chat.chat.say(me, made.id, firstMessage);
      return made;
    },
    asAgent: (agent) => chat.join(agentMember(agent)),
  };
}
