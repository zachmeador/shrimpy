import type { Address } from "./services.ts";

/**
 * What a machine of a person's own keeps in its Shrimpy folder, so that it is
 * that person from then on, and so that a `shrimpy` command run there reaches
 * the gateway as them.
 */
export interface Machine {
  /**
   * What the gateway recognizes the machine by. The machine makes it and keeps
   * it before it asks to join, so that a join whose answer never arrived can
   * be made again with the same token. Only the gateway is shown it.
   */
  token: string;
  /** The gateway's entry: where the machine reaches the gateway, and chat and agents through it. */
  gateway: Address;
  /**
   * Who the gateway said the person is, once it has said it, which is when the
   * machine has joined. A machine that has none was never answered, and is not
   * the person yet.
   */
  member?: { id: string; name: string };
}

/** The file of the Shrimpy folder in which a machine keeps its place: the token, the gateway's address and who it is. */
export const MACHINE_FILE = "machine.json";

/** The file in which the machine whose Shrimpy folder is `folder` keeps its place. */
export function machineFile(folder: string): string {
  return `${folder}/${MACHINE_FILE}`;
}
