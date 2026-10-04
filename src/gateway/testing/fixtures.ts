import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Announcement, GatewayConnection, Registration } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** A valid announcement for an agent. The socket does not have to exist unless a test connects to it. */
export function agentAnnouncement(name: string, socket = `/tmp/${name}.sock`): Announcement {
  return { kind: "agent", serverId: randomUUID(), socket, pid: process.pid, version: SHRIMPY_VERSION };
}

/**
 * Make the connection a new agent called `name` and register it, as an agent
 * does. Says what the gateway now lists for it.
 */
export async function joinAndRegister(
  connection: GatewayConnection,
  name: string,
  announcement: Announcement = agentAnnouncement(name),
): Promise<Registration> {
  const member = await connection.join(name, newToken());
  await connection.register(announcement);
  return { ...announcement, name, memberId: member.id };
}

/** The port of a gateway that was started with a browser entry. */
export function webPortOf(gateway: { readonly webPort: number | undefined }): number {
  assert.ok(gateway.webPort !== undefined, "the gateway has no browser entry");
  return gateway.webPort;
}
