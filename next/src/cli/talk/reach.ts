import type { ChatConnection, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import type { Registration } from "../../contracts/gateway/index.ts";
import type { Io } from "../io/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import { askGateway } from "./gateway.ts";
import { START_EVERYTHING } from "./hints.ts";
import { currentPerson } from "./user.ts";

/** A person's connection to the chat server on this machine, found through the gateway. */
export interface Reached {
  /** You, as the chat server knows you. */
  readonly me: Member;
  readonly connection: ChatConnection;
  /** Every program the gateway listed, oldest first. */
  readonly programs: Registration[];
  /** Drop the connection. Whatever was posted stays posted. */
  close(): Promise<void>;
}

/**
 * Reach the chat server on this machine the way every command that talks does:
 * ask the machine's gateway where it is, connect, and say you are the person who
 * runs the command. A gateway or chat server of another version than this
 * command is named on standard error, and the command carries on. When
 * nothing is running the error says what to start. Aborting `signal` gives up,
 * even on a server that is not answering.
 */
export async function reachChat(io: Io, signal?: AbortSignal): Promise<Reached> {
  const gateway = await askGateway(signal);
  if (gateway === undefined) {
    throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`);
  }
  warnIfVersionDiffers(io, "the gateway", gateway.version);
  const chat = gateway.programs.findLast((program) => program.kind === "chat");
  if (chat === undefined) {
    throw new Error(
      "No chat server is registered with this machine's gateway. " +
        `Start one with: shrimpy chat serve <data-dir>, or start everything with: ${START_EVERYTHING}`,
    );
  }
  warnIfVersionDiffers(io, "the chat server", chat.version);

  const me = currentPerson();
  let connection: ChatConnection;
  try {
    connection = await connectLocal(chat, { signal });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new Error(`Could not reach the chat server at ${chat.socket}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  try {
    await connection.chat.identify(me, signal);
  } catch (error) {
    await connection.close();
    throw error;
  }
  return { me, connection, programs: gateway.programs, close: () => connection.close() };
}
