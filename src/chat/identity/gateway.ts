import type { Member } from "../../contracts/chat/index.ts";
import type { GatewayConnection } from "../../contracts/gateway/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { isRefusal, refuse } from "../../lib/refusal/index.ts";

/** Who people are, as the chat server learns it: from the gateway's roster, and from nobody else. */
export interface Identity {
  /** Whose a ticket is. Refuses a ticket that is no good, and refuses while the gateway cannot be reached. */
  redeem(ticket: string): Promise<Member>;
  /** The member with this ID, or undefined when the roster has none. Refuses while the gateway cannot be reached. */
  member(id: string): Promise<Member | undefined>;
  /** The admins as the roster has them now, which is asked again each time. Refuses while the gateway cannot be reached. */
  admins(): Promise<Member[]>;
}

const UNREACHABLE =
  "The chat server can't reach the gateway right now, so it can't tell who you are. Try again in a moment.";
const UNREACHABLE_FOR_ADMINS =
  "The chat server can't reach the gateway right now, so it can't tell whether you are an admin. Try again in a moment.";

/**
 * Ask the gateway over the connection the chat server already keeps to it, the
 * one it is registered on. With none up, or one that drops while asking, the
 * caller is refused and told why. What the gateway itself refuses reaches the
 * caller as it was said.
 */
export function identityFromGateway(current: () => GatewayConnection | undefined): Identity {
  const ask = async <T>(question: (gateway: GatewayConnection) => Promise<T>, unreachable = UNREACHABLE): Promise<T> => {
    const gateway = current();
    if (gateway === undefined) refuse(unreachable, "service_not_allowed");
    try {
      return await question(gateway);
    } catch (error) {
      if (isDisconnected(error)) refuse(unreachable, "service_not_allowed");
      if (isRefusal(error)) refuse(error.message);
      throw error;
    }
  };
  return {
    redeem: (ticket) => ask(async (gateway) => toMember(await gateway.redeem(ticket))),
    async member(id) {
      const found = (await ask((gateway) => gateway.members())).find((each) => each.id === id);
      return found === undefined ? undefined : toMember(found);
    },
    async admins() {
      const roster = await ask((gateway) => gateway.members(), UNREACHABLE_FOR_ADMINS);
      return roster.filter((each) => each.admin).map(toMember);
    },
  };
}

const toMember = ({ id, kind, name }: Member): Member => ({ id, kind, name });
