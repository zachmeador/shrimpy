import type { Member } from "../../contracts/agent/index.ts";
import type { GatewayConnection } from "../../contracts/gateway/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { isRefusal, refuse } from "../../lib/refusal/index.ts";

const UNREACHABLE =
  "The agent can't reach the gateway right now, so it can't tell who you are. Try again in a moment.";

/**
 * Ask the gateway whose a ticket is, over the connection the agent already
 * keeps to it, the one it is registered on. With none up, or one that drops
 * while asking, the caller is refused and told why. What the gateway itself
 * refuses reaches the caller as it was said.
 */
export async function whoseTicket(current: () => GatewayConnection | undefined, ticket: string): Promise<Member> {
  const gateway = current();
  if (gateway === undefined) refuse(UNREACHABLE, "service_not_allowed");
  try {
    const { id, kind, name } = await gateway.redeem(ticket);
    return { id, kind, name };
  } catch (error) {
    if (isDisconnected(error)) refuse(UNREACHABLE, "service_not_allowed");
    if (isRefusal(error)) refuse(error.message);
    throw error;
  }
}
