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
}

/**
 * Connection scope: finding the programs that are running. The gateway only
 * connects things; it never holds an agent's home, its work or a conversation.
 */
export interface Gateway {
  /** Announce this program. The registration lasts as long as this connection. */
  register(registration: Registration, context: Context): Promise<void>;
  list(context: Context): Promise<Registration[]>;
}
export const Gateway = defineService<Gateway>("shrimpy.gateway");
