import type { ChatConnection } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import type { GatewayConnection, Registration } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";
import { isNotListening } from "../../lib/connection/index.ts";
import type { OpenChat } from "./chat.ts";
import { ChatUnavailableError } from "./unavailable.ts";

/** The two hops to chat. Each is a way of reaching a program, so neither has to be on this machine. */
export interface ChatRoutes {
  /** Reach the gateway, which knows where the chat server is. */
  gateway(): Promise<GatewayConnection>;
  /** Reach the chat server the gateway listed. */
  chat(registered: Registration): Promise<ChatConnection>;
}

/**
 * Find the chat server through the gateway's list of programs, and connect to
 * it. This is the one place that knows how chat is found; how each hop is made
 * is up to `routes`.
 */
export function findChat(routes: ChatRoutes): OpenChat {
  return async () => {
    const gateway = await reachGateway(routes);
    let programs: Registration[];
    try {
      programs = await gateway.list();
    } finally {
      await gateway.close().catch(() => undefined);
    }
    const registered = programs.find((program) => program.kind === "chat");
    if (registered === undefined) throw new ChatUnavailableError("The gateway lists no chat server.");
    try {
      return await routes.chat(registered);
    } catch (error) {
      if (!isNotListening(error)) throw error;
      throw new ChatUnavailableError(`The chat server the gateway lists is not answering on ${registered.socket}.`, {
        cause: error,
      });
    }
  };
}

async function reachGateway(routes: ChatRoutes): Promise<GatewayConnection> {
  try {
    return await routes.gateway();
  } catch (error) {
    if (!(error instanceof GatewayNotRunningError)) throw error;
    throw new ChatUnavailableError(error.message, { cause: error });
  }
}

/** The default: the gateway and the chat server on this machine, reached over their Unix sockets. */
export const openChatLocally: OpenChat = findChat({
  gateway: connectLocalGateway,
  chat: (registered) => connectLocal(registered),
});
