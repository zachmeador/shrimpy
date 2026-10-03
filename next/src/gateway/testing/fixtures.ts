import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Registration } from "../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** A valid registration for an agent. The socket does not have to exist unless a test connects to it. */
export function agentRegistration(name: string, socket = `/tmp/${name}.sock`): Registration {
  return { kind: "agent", name, serverId: randomUUID(), socket, pid: process.pid, version: SHRIMPY_VERSION };
}

/** The port of a gateway that was started with a browser entry. */
export function webPortOf(gateway: { readonly webPort: number | undefined }): number {
  assert.ok(gateway.webPort !== undefined, "the gateway has no browser entry");
  return gateway.webPort;
}
