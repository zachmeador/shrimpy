/**
 * Dialing the gateway from Node, which the terminal hands the link: at the
 * gateway's own socket on this machine, or at its entry, which its key must
 * prove, and why linking failed, as the link's status says it. It must not
 * know what the client holds or shows.
 */
import { HelloRefusedError, keepLinked, UnprovenGatewayError } from "../../../contracts/gateway/node.ts";
import { asError } from "../../../lib/errors/index.ts";
import { type DialPlace, nobodyThere } from "../../../lib/link/node.ts";
import type { Dial, Why } from "../../network/index.ts";

/** How a client keeps linked to the gateway at `place`, from Node: its own socket, or its entry with the fingerprint of its key. */
export function dialAt(place: DialPlace): Dial {
  const why = (error: unknown): Why => {
    if (error instanceof HelloRefusedError) return { kind: "refused", words: error.message };
    if (error instanceof UnprovenGatewayError) return { kind: "unproven", words: error.message };
    if ("path" in place && nobodyThere(error)) return { kind: "not-running" };
    return { kind: "unreachable", message: asError(error).message };
  };
  return ({ onError, ...options }) => keepLinked({ ...options, place, onError: (error) => onError(why(error)) });
}
