import type { AgentEndpoint, Membership } from "../../contracts/agent/index.ts";
import type { GatewayConnection } from "../../contracts/gateway/index.ts";
import {
  type KeepRegisteredOptions,
  keepRegistered,
  type KeptRegistration,
} from "../../contracts/gateway/node.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** Where the agent keeps who it is on the network between starts. */
export interface MembershipStore {
  /** What was kept, or undefined if the agent has not joined yet. */
  read(): Membership | undefined;
  save(membership: Membership): void;
}

export interface GatewayLinkOptions extends Pick<KeepRegisteredOptions, "transportFactory" | "backoff"> {
  /** The name the agent asks the roster to call it. */
  name: string;
  /** Where the agent is listening. */
  endpoint: AgentEndpoint;
  membership: MembershipStore;
  /** The file that says what the agent is called and the file that holds its token, for telling a person which to look at. */
  files: { name: string; membership: string };
  /** Told why the agent could not be a member, once for each reason. */
  onError(error: Error): void;
}

/**
 * Stay a member of the network and registered with this machine's gateway as
 * the agent called `name`. On each connection the agent joins the roster the
 * first time and keeps what the gateway gives it; every time after that it
 * signs in with that token, which also renames it if its name has changed.
 * None of it delays or fails anything: the gateway may start after the agent,
 * and the agent finds it again each time it comes back. A refusal, such as a
 * name another member has, says what to do about it, once.
 */
export function joinGateway(options: GatewayLinkOptions): KeptRegistration {
  const { name, membership, files } = options;
  let reported: string | undefined;

  async function joinOrSignIn(gateway: GatewayConnection): Promise<void> {
    const saved = membership.read();
    try {
      if (saved === undefined) {
        const joined = await gateway.join(name);
        membership.save({ memberId: joined.member.id, token: joined.token });
      } else {
        const member = await gateway.signIn(saved.token, name);
        if (member.id !== saved.memberId) {
          throw new Error(
            `${files.membership} says this agent is ${saved.memberId}, but the gateway says its token is ${member.id}.`,
          );
        }
      }
    } catch (error) {
      if (!isRefusal(error)) throw error;
      const action =
        saved === undefined
          ? `Change the name in ${files.name} and start the agent again.`
          : `If the name is the problem, change it in ${files.name}. If the gateway's roster was replaced, ` +
            `delete ${files.membership} and start the agent again to join as a new member.`;
      throw new Error(`The gateway did not let ${name} in: ${error.message} ${action}`);
    }
    reported = undefined;
  }

  return keepRegistered(
    {
      kind: "agent",
      serverId: options.endpoint.serverId,
      socket: options.endpoint.socket,
      pid: options.endpoint.pid,
      version: SHRIMPY_VERSION,
    },
    {
      transportFactory: options.transportFactory,
      backoff: options.backoff,
      signIn: joinOrSignIn,
      onError(error) {
        if (error.message === reported) return;
        reported = error.message;
        options.onError(error);
      },
    },
  );
}
