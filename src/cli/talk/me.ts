import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import {
  type Address,
  formatAddress,
  type GatewayConnection,
  type Machine,
  machineFile,
  type Transports,
  TURNED_AWAY,
  whyTurnedAway,
} from "../../contracts/gateway/index.ts";
import { entryTransports, localTransports, readMachine } from "../../contracts/gateway/node.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { folderPath } from "../folder/index.ts";
import { signInAsAgentAt } from "./shell.ts";

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

/**
 * Sign in on a connection to the gateway as the person whose machine this is,
 * with the token its Shrimpy folder keeps. A gateway that does not know the
 * token says so in words that name the file to delete to join anew, since
 * nothing else lets the machine in again.
 */
async function signInAsMachine(gateway: GatewayConnection, machine: JoinedMachine): Promise<void> {
  try {
    await gateway.signIn(machine.token, null);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    const where = formatAddress(machine.gateway);
    if (whyTurnedAway(error) === TURNED_AWAY.unknownToken) {
      throw new Error(
        `The gateway at ${where} does not know this machine. Its roster may have been replaced. To join again, delete ` +
          `${machineFile(folderPath())}, ask for a new invitation with shrimpy members invite where the gateway runs, and run the line it prints here.`,
        { cause: error },
      );
    }
    throw new Error(`The gateway at ${where} did not let this machine in: ${error.message}`, { cause: error });
  }
}

/** Who a command is, and where it reaches the gateway. */
export interface Me {
  /**
   * The address of the gateway's network entry, when the command reaches the
   * gateway over the network: the entry the shell's agent joined by, when it is
   * apart from the gateway, or the one this machine joined as the person's own.
   * With none the command reaches the gateway on this machine, over its socket.
   */
  readonly entry: Address | undefined;
  /**
   * Sign in on a connection to the gateway as who the command is: the agent
   * whose shell it is, or the person whose machine this is. On this machine's
   * own socket, as the person who runs the gateway, there is nothing to sign
   * in as, since the gateway takes the connection for them.
   */
  signIn(gateway: GatewayConnection): Promise<void>;
  /** How to open connections to the gateway and the programs behind it. */
  transports(): Transports;
}

const transportsAt = (entry: Address | undefined): Transports =>
  entry === undefined ? localTransports() : entryTransports(entry);

/**
 * Who this command is, and how it reaches the gateway. In the shell of an agent
 * it is that agent, whatever the Shrimpy folder has: the launcher that puts
 * `shrimpy` on its path names the agent's home, which keeps its token and the
 * gateway it joined. Anywhere else in a folder that has joined a gateway as the
 * person's own it is that person, at that gateway. Anywhere else it is the
 * person who runs the gateway on this machine, whom the gateway knows by the
 * socket.
 */
export function me(): Me {
  const home = process.env[AGENT_HOME_VARIABLE];
  if (home !== undefined && home !== "") {
    const entry = readMembership(home)?.gateway;
    return {
      entry,
      signIn: async (gateway) => {
        await signInAsAgentAt(gateway, home);
      },
      transports: () => transportsAt(entry),
    };
  }
  const machine = joinedMachine();
  return {
    entry: machine?.gateway,
    signIn: machine === undefined ? () => Promise.resolve() : (gateway) => signInAsMachine(gateway, machine),
    transports: () => transportsAt(machine?.gateway),
  };
}
