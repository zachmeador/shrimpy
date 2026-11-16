import { hostname } from "node:os";
import { type Entry, type Link, machineFile, type Member, type Welcome } from "../../contracts/gateway/index.ts";
import {
  dialGateway,
  GatewayRefusedError,
  newToken,
  readMachine,
  saveMachine,
  UnknownAnswerError,
  UnprovenGatewayError,
} from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";

/**
 * The gateway could not be reached, stopped answering, or turned the machine
 * away. The folder keeps the machine's token, so the same link can be used
 * again while its code is good. A link that does not fit the machine is no
 * such failure: nothing was tried.
 */
export class MachineJoinFailedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MachineJoinFailedError";
  }
}

export interface JoinAsMachineOptions {
  /** Abort to give up on a gateway that does not answer. */
  signal?: AbortSignal;
  /** What the device is labelled on the roster: the machine's name if not given. */
  machine?: string;
}

/** What joining as a machine came to. */
export interface MachineJoined {
  /** Who the gateway says the machine is: you. */
  member: Member;
  /** The version of Shrimpy the gateway runs. */
  gatewayVersion: string;
}

/**
 * Make the machine whose Shrimpy folder is `folder` a device of yours, with
 * the link of an invitation you asked for. The machine makes its token and
 * keeps it first, with the gateway's address and the fingerprint of its key,
 * so that a join whose answer never arrives can be made again with the same
 * link and finds the same device, as long as it is at the same gateway, by its
 * address and its key: a token is shown to one gateway only. Its hello goes
 * only to the key the link names, and shows the gateway the code, the token and
 * the machine's name, which labels the device, and the folder keeps who the
 * gateway says it is, so that commands run there are you at that gateway from
 * then on. A link that names an agent, and a folder that has joined already,
 * are refused before anything is changed or sent. After that, a gateway that
 * can't be reached, that doesn't answer before `signal` aborts, that shows
 * another key or that turns the machine away is a `MachineJoinFailedError`.
 */
export async function joinAsMachine(folder: string, link: Link, options: JoinAsMachineOptions = {}): Promise<MachineJoined> {
  if (link.name !== null) {
    throw new Error(`The invitation is for an agent called ${link.name}, and not for a device of yours.`);
  }
  const saved = readMachine(folder);
  if (saved?.member !== undefined) {
    throw new Error(
      `This machine is ${saved.member.name}'s already, on the gateway at ${formatAddress(saved.gateway)}. ` +
        `To join anew, delete ${machineFile(folder)} and run this again.`,
    );
  }
  const where = formatAddress(link.address);
  const gateway: Entry = { ...link.address, fingerprint: link.fingerprint };
  const same = saved !== undefined && formatAddress(saved.gateway) === where && saved.gateway.fingerprint === link.fingerprint;
  const token = same ? saved.token : newToken();
  saveMachine(folder, { token, gateway });

  const who = { kind: "join", name: null, token, code: link.code, machine: options.machine ?? hostname() } as const;
  let answer: Welcome;
  try {
    const dialed = await dialGateway(gateway, who, options.signal === undefined ? {} : { signal: options.signal });
    dialed.linked.drop();
    answer = dialed.welcome;
  } catch (error) {
    if (error instanceof GatewayRefusedError) {
      throw new MachineJoinFailedError(`The gateway at ${where} did not let this machine in: ${error.message}`);
    }
    if (error instanceof UnknownAnswerError || error instanceof UnprovenGatewayError) throw new MachineJoinFailedError(error.message);
    throw new MachineJoinFailedError(`Could not join the gateway at ${where}: ${(error as Error).message}`, { cause: error });
  }
  if (answer.you === null) throw new MachineJoinFailedError(`The gateway at ${where} let this machine in as nobody.`);
  saveMachine(folder, { token, gateway, member: { id: answer.you.id, name: answer.you.name } });
  return { member: answer.you, gatewayVersion: answer.shrimpy };
}
