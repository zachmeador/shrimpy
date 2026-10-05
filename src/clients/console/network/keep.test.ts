import assert from "node:assert/strict";
import { test } from "node:test";
import { within } from "../../../lib/testing/index.ts";
import { type Connected, keepConnection } from "./keep.ts";

/** A connection that stays open until it is closed, and says so to whoever listens. */
function anOpenConnection(): Connected & { closed: boolean } {
  const listeners: ((reason: Error | undefined) => void)[] = [];
  const connection = {
    closed: false,
    onDisconnect: (listener: (reason: Error | undefined) => void) => void listeners.push(listener),
    close() {
      connection.closed = true;
      for (const listener of listeners) listener(undefined);
      return Promise.resolve();
    },
  };
  return connection;
}

test("closing a link while its connection is still being opened lets go of the connection when it opens, and does not wait for it to end", async () => {
  const connection = anOpenConnection();
  let opens: (connection: Connected) => void = () => undefined;
  const keeper = keepConnection({
    open: () =>
      new Promise<Connected>((resolve) => {
        opens = resolve;
      }),
  });

  // The stop comes first, and the connection comes up after it, as when a console is left the moment it starts to connect.
  const closing = keeper.close();
  opens(connection);

  await within(2000, closing, "the link to close");
  assert.equal(connection.closed, true);
});
