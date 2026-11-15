import type { TestContext } from "node:test";
import type { Channel, Member, Thread } from "../../contracts/chat/index.ts";
import { type Speaking, speakingAs } from "../../contracts/chat/testing/index.ts";
import type { ChatServer } from "./chat-server.ts";

/** A room that you make, with `members`, its main thread, and you as a member of chat. */
export async function roomWith(
  t: TestContext,
  chat: ChatServer,
  name: string,
  members: Member[],
): Promise<{ person: Speaking; room: Channel; main: Thread }> {
  const person = await speakingAs(t, await chat.person());
  const room = await person.createRoom(name, members.map((member) => member.id));
  const main = (await person.threads(room.id)).find((thread) => thread.main);
  if (main === undefined) throw new Error(`The room ${room.id} has no main thread`);
  return { person, room, main };
}
