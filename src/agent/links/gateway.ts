import type { AgentEndpoint } from "../../contracts/agent/index.ts";
import { type KeepRegisteredOptions, keepRegistered, type KeptRegistration } from "../../contracts/gateway/node.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/**
 * Stay registered with this machine's gateway as the agent called `name`, which
 * listens at `endpoint`. Registering never delays or fails anything: the
 * gateway may start after the agent, and the registration is made again each
 * time it comes back.
 */
export function joinGateway(
  name: string,
  endpoint: AgentEndpoint,
  options: KeepRegisteredOptions = {},
): KeptRegistration {
  return keepRegistered(
    {
      kind: "agent",
      name,
      serverId: endpoint.serverId,
      socket: endpoint.socket,
      pid: endpoint.pid,
      version: SHRIMPY_VERSION,
    },
    options,
  );
}
