import { AGENT_HOME_VARIABLE, joinAsNew, membershipFile } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import { type Entry, type Machine, machineFile } from "../../contracts/gateway/index.ts";
import { gatewaySocket, type HelloRefusedError, readMachine } from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";
import type { DialPlace } from "../../lib/link/node.ts";
import { folderPath } from "../folder/index.ts";
import { notLetIn } from "./join.ts";

/** A machine of a person's own that the gateway has let in: it knows who it is. */
type JoinedMachine = Machine & Required<Pick<Machine, "member">>;

/**
 * The machine this Shrimpy folder has joined as, if it has: the file in the
 * folder holds the gateway's answer. A folder that tried to join and never heard
 * the answer has not joined, and is no machine of anyone's yet. A file that
 * can't be read is an error naming it.
 */
function joinedMachine(): JoinedMachine | undefined {
  const machine = readMachine(folderPath());
  return machine?.member === undefined ? undefined : { ...machine, member: machine.member };
}

/** Who a command is, and where it reaches the gateway. */
export interface Me {
  /** Where the command reaches the gateway: its own socket on this machine, or its entry. */
  readonly place: DialPlace;
  /**
   * The gateway's network entry, with the fingerprint of its key, when the
   * command reaches the gateway over the network: the entry the shell's agent
   * joined by, when it is apart from the gateway, or the one this machine joined
   * as the person's own.
   */
  readonly entry: Entry | undefined;
  /** What the command shows the gateway: the token of the agent whose shell it is, this machine's, or none as you on the gateway's socket. */
  readonly token: string | null;
  /** The home of the agent whose shell the command runs in, when it does. */
  readonly home: string | undefined;
  /** The gateway turned the command's hello away: what to tell the person, in words that say what to do. */
  turnedAway(error: HelloRefusedError): Error;
}

const atThe = (entry: Entry | undefined): DialPlace => entry ?? { path: gatewaySocket() };

/**
 * Who this command is, and how it reaches the gateway. In the shell of an agent
 * it is that agent, whatever the Shrimpy folder has: the launcher that puts
 * `shrimpy` on its path names the agent's home, which keeps its token and the
 * gateway it joined. Anywhere else in a folder that has joined a gateway as the
 * person's own it is that person, at that gateway, with the machine's token.
 * Anywhere else it is you on this machine's gateway, whose own socket takes a
 * hello with no token for you. An agent that has not joined the network has
 * nobody to be, which is an error that says to start it.
 */
export function me(): Me {
  const home = process.env[AGENT_HOME_VARIABLE];
  if (home !== undefined && home !== "") {
    const membership = readMembership(home);
    if (membership === undefined) {
      throw new Error(
        `This command runs in the shell of the agent at ${home}, which has not joined the network yet, ` +
          `so there is nobody for it to act as. Start the agent first: shrimpy agent serve ${home}`,
      );
    }
    const entry = membership.gateway;
    return {
      place: atThe(entry),
      entry,
      token: membership.token,
      home,
      turnedAway(error) {
        const advice = error.reason === "unknown_token" ? ` ${joinAsNew(membershipFile(home), entry !== undefined)}` : "";
        return new Error(`The gateway did not let the agent at ${home} in: ${error.message}${advice}`, { cause: error });
      },
    };
  }
  const machine = joinedMachine();
  if (machine === undefined) {
    return { place: atThe(undefined), entry: undefined, token: null, home: undefined, turnedAway: (error) => new Error(error.message, { cause: error }) };
  }
  const where = formatAddress(machine.gateway);
  return {
    place: machine.gateway,
    entry: machine.gateway,
    token: machine.token,
    home: undefined,
    turnedAway(error) {
      if (error.reason === "unknown_token") {
        return new Error(
          `The gateway at ${where} does not know this machine. Its roster may have been replaced, or the machine was taken ` +
            `back. To join again, delete ${machineFile(folderPath())}, ask for a new invitation with shrimpy invite where the ` +
            "gateway runs, and run the line it prints here.",
          { cause: error },
        );
      }
      return new Error(notLetIn(where, "this machine", error.message), { cause: error });
    },
  };
}
