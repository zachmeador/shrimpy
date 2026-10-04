import { type Context, defineService } from "@earendil-works/chord";

/** A program other programs can reach on this machine. */
export interface Registration {
  kind: "agent" | "chat";
  /** An agent's name, or `chat` for the chat server. */
  name: string;
  serverId: string;
  /** Absolute path of the program's Unix socket. */
  socket: string;
  pid: number;
  /**
   * The version of Shrimpy the program runs. Programs upgrade together, so this
   * is how a mismatch between peers gets reported. The gateway lists it and
   * never refuses a program for it.
   */
  version: string;
}

/**
 * Connection scope: finding the programs that are running. The gateway only
 * connects things; it never holds an agent's home, its work or a conversation.
 */
export interface Gateway {
  /**
   * Announce this program. The registration lasts as long as this connection.
   * Only a program on the gateway's machine can register: a connection that
   * came through the browser entry is refused.
   */
  register(registration: Registration, context: Context): Promise<void>;
  list(context: Context): Promise<Registration[]>;
  /**
   * The version of Shrimpy the gateway runs, so that whoever talks through it
   * can tell when they were not built together. Like a registration's version,
   * it is reported and never refused.
   */
  version(context: Context): Promise<string>;
}
export const Gateway = defineService<Gateway>("shrimpy.gateway");
