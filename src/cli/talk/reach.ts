import type { Reference } from "@earendil-works/chord";
import { Chat, type Member } from "../../contracts/chat/index.ts";
import { type Program, type RosterEntry } from "../../contracts/gateway/index.ts";
import type { Client } from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";
import type { Io } from "../io/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import { GatewayNotRunningError, linkAs, viewOf } from "./gateway.ts";
import { START_EVERYTHING } from "./hints.ts";
import { me } from "./me.ts";
import { contextOf } from "./objects.ts";

/** How long a command waits for the chat server to answer, once the gateway lists it. */
const CHAT_MS = 15_000;

/** Chat, reached through the gateway, as whoever the gateway says this is. */
export interface Reached {
  /** You, as the chat server knows you. */
  readonly me: Member;
  /** The link to the gateway, through which channels and threads are held too. */
  readonly client: Client;
  /** You as a member of chat. */
  readonly chat: Reference<typeof Chat>;
  /** Every program the gateway listed, oldest first. */
  readonly programs: Program[];
  /** Everyone the gateway's roster listed, oldest first. */
  readonly members: RosterEntry[];
  /** Let go of chat and drop the link. Whatever was posted stays posted. */
  close(): Promise<void>;
}

/**
 * Reach the chat server the way every command that talks does: through the
 * gateway, which stamps every request with who is asking. The gateway is this
 * machine's, or the one that the shell's agent, when it is apart from the
 * gateway, or this machine, when it joined one as the person's own, reaches over
 * its entry. Nobody says who they are: the gateway decides from the token the
 * command shows, the agent's in its shell and the machine's on a machine that
 * joined, and on this machine's socket with none it is you. A gateway or chat
 * server of another version than this command is named on standard error, and
 * the command carries on. When nothing is running the error says what to start.
 * Aborting `signal` gives up, even on a server that is not answering.
 */
export async function reachChat(io: Io, signal?: AbortSignal): Promise<Reached> {
  const who = me();
  let client: Client;
  try {
    client = await linkAs(who, signal);
  } catch (error) {
    if (error instanceof GatewayNotRunningError) throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`, { cause: error });
    throw error;
  }
  try {
    const listing = await viewOf(client, signal);
    warnIfVersionDiffers(io, "the gateway", listing.version);
    const server = listing.programs.findLast((program) => program.kind === "chat");
    if (server === undefined) {
      throw new Error(
        who.entry === undefined
          ? "No chat server is linked to this machine's gateway. " +
              `Start one with: shrimpy chat serve <data-dir>, or start everything with: ${START_EVERYTHING}`
          : `No chat server is linked to the gateway at ${formatAddress(who.entry)}.`,
      );
    }
    warnIfVersionDiffers(io, "the chat server", server.shrimpy);
    let chat: Reference<typeof Chat>;
    try {
      chat = await client.host.get(Chat, {}, contextOf(signal), { readyTimeout: CHAT_MS });
    } catch (error) {
      if (signal?.aborted === true) throw error;
      throw new Error(`Could not reach the chat server through the gateway: ${(error as Error).message}`, { cause: error });
    }
    const you = chat.you.value;
    if (you === null) {
      chat.release();
      throw new Error("The chat server takes this command for nobody: only the network's members use chat.");
    }
    return {
      me: you,
      client,
      chat,
      programs: listing.programs,
      members: listing.members,
      async close() {
        chat.release();
        await client.close();
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
