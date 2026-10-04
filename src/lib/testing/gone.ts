import { once } from "node:events";
import { connect } from "node:net";

/**
 * Connect to the server on `socket`, send it something that is not the
 * protocol, and leave at once. The server answers that and hangs up, so its
 * answer is written to a client that has gone.
 */
export async function leaveUnanswered(socket: string): Promise<void> {
  const client = connect(socket);
  await once(client, "connect");
  client.write(Buffer.alloc(16, 0xff));
  client.destroy();
}
