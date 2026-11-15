import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { Member, Thread } from "../../../../contracts/chat/index.ts";
import { memberNamed, type Speaking, speakingAs } from "../../../../contracts/chat/testing/index.ts";
import { gatewaySocket } from "../../../../contracts/gateway/node.ts";
import { linkTestAgent, startTestGateway, type TestAgent, type TestGateway } from "../../../../contracts/gateway/testing/index.ts";
import { backoff } from "../../../../lib/retry/index.ts";
import { type Child, eventually, startChild, stopAfter, tempDir, useRuntimeDir } from "../../../../lib/testing/index.ts";
import { type ConsoleState, createConsoleState, type Model } from "../index.ts";

/** The command that runs Shrimpy, which is how a person starts the chat server. */
const shrimpy = fileURLToPath(new URL("../../../../cli/main.ts", import.meta.url));

/** The real chat server, as the command starts it in a process of its own. */
export interface TestChat {
  /** Kill it, like a chat server that went away. What was said stays in its data. */
  outage(): Promise<void>;
  /** Start it again on the same data, like a chat server that came back. */
  recover(): Promise<void>;
  /** Stop it without ending it, like a chat server that went dead: it takes what is sent and answers nothing. */
  freeze(): void;
  /** Let a chat server that was frozen run again. */
  thaw(): void;
}

/** Start the real chat server through the command, with a data directory of its own, killed when the test ends. */
async function startTestChat(t: TestContext): Promise<TestChat> {
  const dataDir = tempDir(t, "chat-data");
  let running: Child<unknown> | undefined;
  const start = async (): Promise<void> => {
    running = await startChild(t, { file: shrimpy, args: ["chat", "serve", dataDir] });
  };
  await start();
  return {
    async outage() {
      const stopped = running;
      running = undefined;
      await stopped?.kill("SIGKILL");
    },
    async recover() {
      if (running !== undefined) throw new Error("The chat server is running.");
      await start();
    },
    freeze() {
      if (running !== undefined) process.kill(running.pid, "SIGSTOP");
    },
    thaw() {
      if (running !== undefined) process.kill(running.pid, "SIGCONT");
    },
  };
}

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
  readonly state: ConsoleState;
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

  const state = await createConsoleState({
    place: { path: gatewaySocket() },
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
