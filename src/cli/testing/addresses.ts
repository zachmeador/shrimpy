import { connect, createServer, type AddressInfo } from "node:net";
import type { Address } from "../../contracts/gateway/index.ts";

/**
 * A free port on each of `hosts`, chosen together so that no two are the same.
 * Another process could take one before the test uses it, which is rare.
 */
export async function freeAddresses(hosts: string[]): Promise<Address[]> {
  const probes = await Promise.all(
    hosts.map(async (host) => {
      const probe = createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, host, resolve);
      });
      return { host, probe, port: (probe.address() as AddressInfo).port };
    }),
  );
  await Promise.all(probes.map(({ probe }) => new Promise<void>((resolve) => probe.close(() => resolve()))));
  return probes.map(({ host, port }) => ({ host, port }));
}

/** Whether something accepts a connection at `address`. */
export function canConnect({ host, port }: Address): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
