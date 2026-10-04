import { userInfo } from "node:os";
import { type Member, personMember } from "../../contracts/chat/index.ts";

/** You in chat: the person named for the operating system user who runs the command. */
export function currentPerson(): Member {
  let username: string;
  try {
    username = userInfo().username;
  } catch (error) {
    throw new Error("Could not tell which operating system user this is, so there is no one to talk as.", {
      cause: error,
    });
  }
  return personMember(username);
}
