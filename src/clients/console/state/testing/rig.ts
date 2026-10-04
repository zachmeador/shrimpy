import type { TestContext } from "node:test";
import { type StandInAgent, startStandInAgent } from "../../../../contracts/agent/testing/index.ts";
import type { Member, Thread } from "../../../../contracts/chat/index.ts";
import { type Entered, scriptedChat, type StandInChat, startStandInChat } from "../../../../contracts/chat/testing/index.ts";
import { startTestGateway, type TestGateway } from "../../../../contracts/gateway/testing/index.ts";
import { backoff } from "../../../../lib/retry/index.ts";
import { eventually, stopAfter, useRuntimeDir } from "../../../../lib/testing/index.ts";
import { localTransports, type Transports } from "../../network/index.ts";
import { type ConsoleState, createConsoleState, type Model } from "../index.ts";

export interface RigOptions {
  /** The agents to run, by name. Each is registered with the gateway. Scout by default. */
  agents?: string[];
  /** Run no gateway. */
  noGateway?: boolean;
  /** How the console reaches what is running, given the way to this machine's sockets. */
  transports?: (local: Transports) => Transports;
  /** How long a notice stays, in milliseconds. */
  noticeMs?: number;
  /** How long sending waits for the chat server, in milliseconds. */
  sendMs?: number;
}

/** The real gateway, a stand-in chat server and stand-in agents on real sockets, and a console state talking to them. */
export interface Rig {
  readonly state: ConsoleState;
  readonly gateway: TestGateway | undefined;
  readonly chat: StandInChat;
  readonly agents: Record<string, StandInAgent>;
  /** The state's model when `done` accepts it, from now or as it changes. */
  until(done: (model: Model) => boolean, what: string): Promise<Model>;
  /** The person who runs the gateway, as the console meets them, in a connection of the rig's own to chat. */
  person(): Promise<Entered>;
  /** An agent as the roster has it, once it has joined. */
  member(agent: string): Promise<Member>;
  /** The person's DM with an agent, made if need be: its channel and its main thread. */
  dm(agent: string): Promise<{ channelId: string; main: Thread }>;
  /** A thread in the person's DM with an agent, made as if the person had started it, with a first message. */
  thread(agent: string, firstMessage: string): Promise<Thread>;
  /** Come in to the chat server as an agent does, to work in a thread. Closed when the test ends. */
  asAgent(agent: string): Promise<Entered>;
}

/** Everything is running before the state starts, so a test sees the console meeting what is already there. */
export async function startRig(t: TestContext, options: RigOptions = {}): Promise<Rig> {
  useRuntimeDir(t);
  const gateway = options.noGateway === true ? undefined : await startTestGateway(t);
  // Every moment the chat stamps is a second after the last, so threads come in the order they were made.
  let clock = Date.parse("2026-10-03T12:00:00Z");
  const chat = await startStandInChat(t, { chat: scriptedChat({ now: () => (clock += 1000) }) });
  const agents: Record<string, StandInAgent> = {};
  for (const name of options.agents ?? ["scout"]) agents[name] = await startStandInAgent(t, { name });
  if (gateway !== undefined) await Promise.all(Object.values(agents).map((each) => each.joined));

  const local = localTransports();
  const state = createConsoleState({
    transports: options.transports?.(local) ?? local,
    pollMs: 15,
    noticeMs: options.noticeMs,
    sendMs: options.sendMs,
    backoff: backoff({ firstMs: 1, maxMs: 8, random: () => 0 }),
  });
  stopAfter(t, () => state.close());

  let person: Promise<Entered> | undefined;
  const standIn = (agent: string): StandInAgent => {
    const found = agents[agent];
    if (found === undefined) throw new Error(`The rig has no agent called ${agent}.`);
    return found;
  };
  const memberOf = async (agent: string): Promise<Member> => (await standIn(agent).joined).member;
  const dm = async (agent: string): Promise<{ channelId: string; main: Thread }> => {
    const found = chat.chat.dm((await rig.person()).me, await memberOf(agent));
    return { channelId: found.channel.id, main: found.thread };
  };
  const rig: Rig = {
    state,
    gateway,
    chat,
    agents,
    until: (done, what) => eventually(() => state.model(), done, { what }),
    person: () => (person ??= chat.asPerson()),
    member: memberOf,
    dm,
    async thread(agent, firstMessage) {
      const connection = await rig.person();
      const made = await connection.chat.createThread((await dm(agent)).channelId, null);
      chat.chat.say(connection.me, made.id, firstMessage);
      return made;
    },
    asAgent: async (agent) => chat.asAgent(agent, (await standIn(agent).joined).token),
  };
  return rig;
}
