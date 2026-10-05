import type { GatewayConnection } from "../../contracts/gateway/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { isRefusal, refuse } from "../../lib/refusal/index.ts";
import type { Asker } from "../access/index.ts";

const UNREACHABLE =
  "The agent can't reach the gateway right now, so it can't tell who you are. Try again in a moment.";

/**
 * Ask the gateway whose a ticket is, and who the admins are, over the connection
 * the agent already keeps to it, the one it is registered on. The agent's own
 * member ID, which only the agent knows, says whether the caller is the agent
 * itself. With no connection up, or one that drops while asking, the caller is
 * refused and told why. What the gateway itself refuses reaches the caller as it
 * was said.
 */
export async function whoseTicket(
  current: () => GatewayConnection | undefined,
  ticket: string,
  own: () => string | undefined,
): Promise<Asker> {
  const gateway = current();
  if (gateway === undefined) refuse(UNREACHABLE, "service_not_allowed");
  try {
    const redeemed = await gateway.redeem(ticket);
    const roster = await gateway.members();
    return {
      member: { id: redeemed.id, kind: redeemed.kind, name: redeemed.name },
      admin: redeemed.admin,
      self: redeemed.id === own(),
      admins: roster.filter((each) => each.admin).map((each) => ({ name: each.name })),
    };
  } catch (error) {
    if (isDisconnected(error)) refuse(UNREACHABLE, "service_not_allowed");
    if (isRefusal(error)) refuse(error.message);
    throw error;
  }
}
