import { createConnection } from "node:net";
import { pipeline } from "node:stream";
import type { TestContext } from "node:test";
import { createWebSocketStream, WebSocket } from "ws";
import {
  type Address,
  answerPath,
  formatAddress,
  type GatewayConnection,
  type Member,
} from "../../contracts/gateway/index.ts";
import { stopAfter } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { type EchoProgram, startEchoProgram } from "./echo.ts";
import { entryOf, invited } from "./fixtures.ts";

/**
 * Answer the call `call` as an agent apart does, in the fewest words: open the
 * connection that carries the call's ID on the gateway's entry, and join it
 * byte for byte to the server at `socket`. It ends with the test.
 */
export function answerCall(t: TestContext, entry: Address, call: string, socket: string): void {
  const web = new WebSocket(`ws://${formatAddress(entry)}${answerPath(call)}`);
  web.on("error", () => undefined);
  stopAfter(t, () => web.terminate());
  web.once("open", () => {
    const stream = createWebSocketStream(web);
    const own = createConnection(socket);
    pipeline(stream, own, stream, () => {
      web.terminate();
      own.destroy();
    });
  });
}

/** An agent apart from the gateway, as the gateway sees one, with a server of its own that only its own answers reach. */
export interface AgentApart {
  readonly name: string;
  readonly member: Member;
  readonly token: string;
  /** The connection it registered on with no socket, which it asks for its calls over. */
  readonly connection: GatewayConnection;
  /** Its own server, which a call that is answered is joined to. How many connections it has says who opened them. */
  readonly server: EchoProgram;
  /** The call IDs the gateway tells it of, until there are `count`. */
  waitForCalls(count: number): Promise<string[]>;
  /** Answer the call `call`, as an agent does. */
  answer(call: string): void;
}

/**
 * An agent that joined from apart with an invitation the person asked for and
 * registered with no socket, with a server of its own listening in the test's
 * runtime directory. It asks for its calls and answers them when the test says
 * so, and nothing else.
 */
export async function startAgentApart(
  t: TestContext,
  gateway: { readonly listening: Address[] },
  person: GatewayConnection,
  name: string,
): Promise<AgentApart> {
  const server = await startEchoProgram(t, `apart-${name}`);
  const { connection, member, token } = await invited(t, gateway, person, name);
  await connection.register({ kind: "agent", serverId: server.serverId, version: SHRIMPY_VERSION });
  const entry = entryOf(gateway);
  return {
    name,
    member,
    token,
    connection,
    server,
    async waitForCalls(count) {
      const calls: string[] = [];
      while (calls.length < count) calls.push(...(await connection.calls()));
      return calls;
    },
    answer: (call) => answerCall(t, entry, call, server.socket),
  };
}
