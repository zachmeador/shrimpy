import { type ChatConnection, connectChat, type Member } from "../../contracts/chat/index.ts";
import { formatAddress, reachProgram, type Registration, type RosterEntry } from "../../contracts/gateway/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Io } from "../io/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import { view, withGateway } from "./gateway.ts";
import { START_EVERYTHING } from "./hints.ts";

/** A connection to the chat server, made through the gateway, as whoever the gateway says this is. */
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
 * Reach the chat server the way every command that talks does: by its name
 * through the gateway, which gives a ticket to hand it, so that the chat server
 * asks the gateway who is talking. The gateway is this machine's, or the one
 * that the shell's agent, when it is apart from the gateway, or this machine,
 * when it joined one as the person's own, reaches over its entry. Nobody says
 * who they are: the gateway decides. A command run from an agent's shell signs
 * in with that agent's token and is the agent; one run on a machine that joined
 * signs in with the machine's token and is the person; any other is the person
 * who runs the gateway. A gateway or chat server of another
 * version than this command is
 * named on standard error, and the command carries on. When nothing is running
 * the error says what to start. Aborting `signal` gives up, even on a server
 * that is not answering.
 */
export async function reachChat(io: Io, signal?: AbortSignal): Promise<Reached> {
  const reached = await withGateway(signal, async (gateway, who) => {
    await who.signIn(gateway);
    const listing = await view(gateway);
    warnIfVersionDiffers(io, "the gateway", listing.version);
    const chat = listing.programs.findLast((program) => program.kind === "chat");
    if (chat === undefined) {
      throw new Error(
        who.entry === undefined
          ? "No chat server is registered with this machine's gateway. " +
              `Start one with: shrimpy chat serve <data-dir>, or start everything with: ${START_EVERYTHING}`
          : `No chat server is registered with the gateway at ${formatAddress(who.entry)}.`,
      );
    }
    warnIfVersionDiffers(io, "the chat server", chat.version);
    try {
      const { connection, entered } = await reachProgram({
        gateway,
        transports: who.transports(),
        target: { kind: chat.kind, name: chat.name },
        connect: connectChat,
        enter: (opened, ticket, enterSignal) => opened.chat.enter(ticket, enterSignal),
        signal,
      });
      return { connection, me: entered, listing };
    } catch (error) {
      // A refusal says what to do, and an abort is the caller's own doing.
      if (signal?.aborted === true || isRefusal(error)) throw error;
      throw new Error(`Could not reach the chat server through the gateway: ${(error as Error).message}`, {
        cause: error,
      });
    }
  });
  if (reached === undefined) {
    throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`);
  }
  const { connection, me, listing } = reached;
  return { me, connection, programs: listing.programs, members: listing.members, close: () => connection.close() };
}
