import type { Channel, Member, Thread } from "../../contracts/chat/index.ts";
import type { Entered } from "../../contracts/chat/testing/index.ts";
import type { ChatServer } from "./chat-server.ts";

/** A room that the person who runs the gateway makes, with `members`, and its main thread. */
export async function roomWith(
  chat: ChatServer,
  name: string,
  members: Member[],
): Promise<{ person: Entered; room: Channel; main: Thread }> {
  const person = await chat.person();
  const room = await person.chat.createRoom(
    name,
    members.map((member) => member.id),
  );
  const main = (await person.chat.threads(room.id)).find((thread) => thread.main);
  if (main === undefined) throw new Error(`The room ${room.id} has no main thread`);
  return { person, room, main };
}
