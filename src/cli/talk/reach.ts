import type { ChatConnection, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import type { Registration, RosterEntry } from "../../contracts/gateway/index.ts";
import type { Io } from "../io/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import { view, withGateway } from "./gateway.ts";
import { START_EVERYTHING } from "./hints.ts";

/** A connection to the chat server on this machine, found through the gateway, as whoever the gateway says this is. */
export interface Reached {
  /** You, as the chat server knows you. */
  readonly me: Member;
  readonly connection: ChatConnection;
  /** Every program the gateway listed, oldest first. */
  readonly programs: Registration[];
  /** Everyone the gateway's roster listed, oldest first. */
  readonly members: RosterEntry[];
  /** Drop the connection. Whatever was posted stays posted. */
  close(): Promise<void>;
}

/**
 * Reach the chat server on this machine the way every command that talks does:
 * ask the machine's gateway where it is and for a ticket to hand it, connect, and
 * come in with the ticket. Nobody says who they are: the gateway decides, and
 * a command run by a person is that person. A gateway or chat server of another
 * version than this command is named on standard error, and the command
 * carries on. When nothing is running the error says what to start. Aborting
 * `signal` gives up, even on a server that is not answering.
 */
export async function reachChat(io: Io, signal?: AbortSignal): Promise<Reached> {
  const found = await withGateway(signal, async (gateway) => {
    const listing = await view(gateway);
    warnIfVersionDiffers(io, "the gateway", listing.version);
    const chat = listing.programs.findLast((program) => program.kind === "chat");
    if (chat === undefined) {
      throw new Error(
        "No chat server is registered with this machine's gateway. " +
          `Start one with: shrimpy chat serve <data-dir>, or start everything with: ${START_EVERYTHING}`,
      );
    }
    warnIfVersionDiffers(io, "the chat server", chat.version);
    return { listing, chat, ticket: await gateway.ticket({ kind: chat.kind, name: chat.name }) };
  });
  if (found === undefined) {
    throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`);
  }
  const { listing, chat, ticket } = found;

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
    const me = await connection.chat.enter(ticket, signal);
    return { me, connection, programs: listing.programs, members: listing.members, close: () => connection.close() };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
