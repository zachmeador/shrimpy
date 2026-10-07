import { isRefusal, isUnknownCall } from "../../lib/refusal/index.ts";
import { formatAddress } from "./address.ts";
import { connectGateway, type GatewayConnection } from "./connect.ts";
import { entryTransports } from "./entry.node.ts";
import type { Link } from "./link.ts";
import { machineFile } from "./machine.ts";
import { readMachine, saveMachine } from "./machine.node.ts";
import type { Member } from "./services.ts";
import { newToken } from "./token.node.ts";

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
  /** Abort to give up on a gateway that does not answer, whether the connection was still being made or the join was waiting for its answer. */
  signal?: AbortSignal;
}

/** What joining as a machine came to. */
export interface MachineJoined {
  /** Who the gateway says the machine is: the person. */
  member: Member;
  /** The version of Shrimpy the gateway runs, when it said. */
  gatewayVersion: string | undefined;
}

/** What went wrong when the gateway at `where` was asked to let the machine in, said so that a person knows what to do. */
function failureOf(error: unknown, where: string): string {
  if (isRefusal(error)) return `The gateway at ${where} did not let this machine in: ${error.message}`;
  if (isUnknownCall(error)) {
    return (
      `The gateway at ${where} does not know how to let a machine in, so it runs an older version of Shrimpy than this command. ` +
      "Programs are meant to be upgraded together."
    );
  }
  return `The gateway at ${where} stopped answering before this machine was let in: ${(error as Error).message}`;
}

/**
 * Make the machine whose Shrimpy folder is `folder` one of a person's own, with
 * the link of an invitation that the person asked for. The machine makes its
 * token and keeps it first, as an agent's home does, so that a join whose
 * answer never arrives can be made again with the same link and finds the same
 * machine, as long as it is at the same gateway: a token is shown to one
 * gateway only. It then shows the gateway the code and the token, and keeps who
 * the gateway says it is, with the gateway's address and the token, so that
 * commands run in the folder are that person at that gateway from then on. A
 * link that names an agent, and a folder that has joined already, are refused
 * before anything is changed or sent. After that, a gateway that can't be
 * reached, that doesn't answer before `signal` aborts, or that turns the
 * machine away is a `MachineJoinFailedError`.
 */
export async function joinAsMachine(
  folder: string,
  link: Link,
  options: JoinAsMachineOptions = {},
): Promise<MachineJoined> {
  if (link.name !== null) {
    throw new Error(`The invitation is for an agent called ${link.name}, and not for another machine of the person's own.`);
  }
  const saved = readMachine(folder);
  if (saved?.member !== undefined) {
    throw new Error(
      `This machine is ${saved.member.name}'s already, on the gateway at ${formatAddress(saved.gateway)}. ` +
        `To join anew, delete ${machineFile(folder)} and run this again.`,
    );
  }
  const where = formatAddress(link.address);
  const token = saved !== undefined && formatAddress(saved.gateway) === where ? saved.token : newToken();
  saveMachine(folder, { token, gateway: link.address });

  const { signal } = options;
  let gateway: GatewayConnection;
  try {
    gateway = await connectGateway({ transportFactory: entryTransports(link.address).gateway, signal });
  } catch (error) {
    throw new MachineJoinFailedError(`Could not reach the gateway at ${where}: ${(error as Error).message}`, { cause: error });
  }
  // Closing the connection ends a join that is still waiting for its answer.
  const hangUp = (): void => void gateway.close().catch(() => undefined);
  signal?.addEventListener("abort", hangUp, { once: true });
  try {
    const member = await gateway.joinMachine(token, link.code).catch((error: unknown) => {
      throw new MachineJoinFailedError(failureOf(error, where), { cause: error });
    });
    saveMachine(folder, { token, gateway: link.address, member: { id: member.id, name: member.name } });
    // Once the machine is in, a gateway that won't say its version is no reason to say it failed.
    const gatewayVersion = await gateway.version().catch(() => undefined);
    return { member, gatewayVersion };
  } finally {
    signal?.removeEventListener("abort", hangUp);
    await gateway.close().catch(() => undefined);
  }
}
