import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import {
  type Address,
  type Announcement,
  connectGateway,
  entryTransports,
  type GatewayConnection,
  type Member,
  type Registration,
} from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { stopAfter } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** A valid announcement for an agent. The socket does not have to exist unless a test connects to it. */
export function agentAnnouncement(name: string, socket = `/tmp/${name}.sock`): Announcement {
  return { kind: "agent", serverId: randomUUID(), socket, version: SHRIMPY_VERSION };
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
  return { kind: announcement.kind, name, memberId: member.id, version: announcement.version };
}

/** The port of a gateway that was started with a browser entry. */
export function webPortOf(gateway: { readonly webPort: number | undefined }): number {
  assert.ok(gateway.webPort !== undefined, "the gateway has no browser entry");
  return gateway.webPort;
}

/** Where a gateway that is to open its network entry on loopback is told to listen. Port 0 has it pick one. */
export const LOOPBACK: Address[] = [{ host: "127.0.0.1", port: 0 }];

/** The first address a gateway that was started with a network entry listens on. */
export function entryOf(gateway: { readonly listening: Address[] }): Address {
  const [address] = gateway.listening;
  assert.ok(address !== undefined, "the gateway has no network entry");
  return address;
}

/**
 * A connection to the gateway over its network entry: apart from the gateway,
 * and nobody until it signs in or joins. It is closed when the test ends.
 */
export async function connectApart(
  t: TestContext,
  gateway: { readonly listening: Address[] },
): Promise<GatewayConnection> {
  const connection = await connectGateway({ transportFactory: entryTransports(entryOf(gateway)).gateway });
  stopAfter(t, () => connection.close());
  return connection;
}

/**
 * An agent that joined from apart with an invitation the person asked for, and
 * the connection it joined on, which is signed in as the agent. It has not
 * registered.
 */
export async function invited(
  t: TestContext,
  gateway: { readonly listening: Address[] },
  person: GatewayConnection,
  name: string,
): Promise<{ connection: GatewayConnection; member: Member; token: string; code: string }> {
  const { code } = await person.invite(name);
  const connection = await connectApart(t, gateway);
  const token = newToken();
  return { connection, member: await connection.join(name, token, code), token, code };
}
