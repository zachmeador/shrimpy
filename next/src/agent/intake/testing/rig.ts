import type { TestContext } from "node:test";
import { agentMember, type Member, type Message, type Thread } from "../../../contracts/chat/index.ts";
import { type ScriptedChat, scriptedChat } from "../../../contracts/chat/testing/index.ts";
import { backoff } from "../../../lib/retry/index.ts";
import { eventually, stopAfter } from "../../../lib/testing/index.ts";
import { type ChatLink, openChatLink } from "../../links/index.ts";
import { type Intake, type IntakeOptions, startIntake } from "../index.ts";
import { type ScriptedTurns, scriptedTurns } from "./turns.ts";

export const zach: Member = { id: "person:zach", kind: "person", name: "Zach" };
export const scout = agentMember("scout");

export interface IntakeRig {
  readonly chat: ScriptedChat;
  readonly turns: ScriptedTurns;
  readonly link: ChatLink;
  readonly intake: Intake;
  /** What the link and the intake reported. */
  readonly errors: Error[];
  /** The main thread of the DM between Zach and the agent. */
  readonly thread: Thread;
  /** Zach says something in the thread, whatever state the chat is in. */
  say(text: string): Message;
  /** Everything said in the thread, oldest first. */
  said(): Message[];
}

export interface IntakeRigOptions extends Partial<Pick<IntakeOptions, "messageLimit">> {
  /** The chat to use; by default a new one. */
  chat?: ScriptedChat;
  /** The records to use; by default new ones. A restarted agent is a second rig over the same two. */
  turns?: ScriptedTurns;
}

/**
 * An intake for the agent Scout, wired to a scripted chat and scripted turns,
 * with Zach to talk to it. It returns once the agent is reading its feed.
 * Pauses between retries are a few milliseconds. The intake and its link are
 * stopped when the test ends.
 */
export async function startIntakeRig(t: TestContext, options: IntakeRigOptions = {}): Promise<IntakeRig> {
  const chat = options.chat ?? scriptedChat();
  const turns = options.turns ?? scriptedTurns();
  const errors: Error[] = [];
  const { thread } = chat.dm(zach, scout);
  const reading = chat.calls("feed");

  const link = openChatLink({
    self: scout,
    open: () => chat.connect(),
    onError: (error) => errors.push(error),
    backoff: backoff({ firstMs: 5, maxMs: 20 }),
  });
  const intake = startIntake({
    self: scout,
    link,
    turns,
    onError: (error) => errors.push(error),
    backoff: () => backoff({ firstMs: 5, maxMs: 20 }),
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });
  // Stops run newest first: the intake stops before the link it uses.
  stopAfter(t, () => link.close());
  stopAfter(t, () => intake.close());
  await eventually(() => chat.calls("feed"), (calls) => calls > reading, { what: "the agent to start reading the feed" });

  return {
    chat,
    turns,
    link,
    intake,
    errors,
    thread,
    say: (text) => chat.say(zach, thread.id, text),
    said: () => chat.messages(thread.id),
  };
}
