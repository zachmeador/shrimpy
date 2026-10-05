import type { TestContext } from "node:test";
import type { ChatConnection, Member } from "../../contracts/chat/index.ts";
import {
  connectToSocket,
  type Entered,
  enterAsAgent,
  enterAsPerson,
  joinRoster,
  renameAgent,
  ticketForPerson,
} from "../../contracts/chat/testing/index.ts";
import { startTestGateway, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { type RunningChat, startChat } from "../index.ts";

export interface TestChat {
  readonly chat: RunningChat;
  readonly dataDir: string;
  /** The real gateway the chat server is registered with. */
  readonly gateway: TestGateway;
  /** A connection straight to the chat server's own socket, which has not come in: no client makes one, and a test of the chat server needs it. */
  connect(): Promise<ChatConnection>;
  /** Come in as the person who runs the gateway, by the chat server's name through the gateway. */
  person(): Promise<Entered>;
  /** Come in as the agent called `name`. It joins the roster the first time, and is the same member each time after. */
  agent(name: string): Promise<Entered>;
  /** Make the agent called `name` a member of the roster, without its coming in. */
  member(name: string): Promise<Member>;
  /** Rename an agent that has joined, as starting it again under another name does. */
  rename(name: string, renamed: string): Promise<Member>;
  /** Make an agent an admin, or an ordinary agent again, as the person who runs the gateway does. The chat server reads it at once. */
  setAdmin(member: Member, admin: boolean): Promise<void>;
  /** A ticket for the chat server, for the person who runs the gateway. */
  ticket(): Promise<string>;
}

/**
 * A chat server in this process, with a data directory and a runtime directory
 * of its own, registered with the real gateway, which runs as a process of its
 * own. Both stop, with the connections made through them, when the test ends.
 */
export async function startTestChat(t: TestContext): Promise<TestChat> {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  const dataDir = tempDir(t, "chat-data");
  const chat = await startChat({ dataDir, backoff: backoff({ firstMs: 5, maxMs: 50 }) });
  stopAfter(t, () => chat.close());
  return {
    chat,
    dataDir,
    gateway,
    async connect() {
      const connection = await connectToSocket(chat);
      stopAfter(t, () => connection.close());
      return connection;
    },
    person: () => enterAsPerson(t),
    agent: (name) => enterAsAgent(t, name),
    member: (name) => joinRoster(t, name),
    rename: (name, renamed) => renameAgent(t, name, renamed),
    async setAdmin(member, admin) {
      const person = await gateway.connect();
      await (admin ? person.promote(member.id) : person.demote(member.id));
    },
    ticket: () => ticketForPerson(t),
  };
}
