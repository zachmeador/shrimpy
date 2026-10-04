import assert from "node:assert/strict";
import { test } from "node:test";
import { backoff } from "../../../lib/retry/index.ts";
import { until, within } from "../../../lib/testing/index.ts";
import { type Connected, keepConnection } from "./keep.ts";
import { CONNECTING, Down, type LinkStatus } from "./status.ts";

const quick = () => backoff({ firstMs: 1, maxMs: 4, random: () => 0 });

/** A connection that does nothing but end when told to. */
class Fake implements Connected {
  closed = false;
  readonly #listeners: ((reason: Error | undefined) => void)[] = [];
  onDisconnect(listener: (reason: Error | undefined) => void): void {
    this.#listeners.push(listener);
  }
  close(): Promise<void> {
    this.closed = true;
    this.drop();
    return Promise.resolve();
  }
  drop(): void {
    for (const listener of this.#listeners) listener(undefined);
  }
}

const reasonOf = (status: LinkStatus): string => (status.state === "up" ? "up" : status.why.kind);

test("a connection that comes up is current, and one that is lost is replaced by another", async () => {
  const made: Fake[] = [];
  const statuses: string[] = [];
  const ups: string[] = [];
  const keeper = keepConnection<Fake>({
    backoff: quick(),
    open() {
      const connection = new Fake();
      made.push(connection);
      return Promise.resolve(connection);
    },
    onUp(connection) {
      ups.push(`up ${String(made.indexOf(connection))}`);
      return () => void ups.push(`down ${String(made.indexOf(connection))}`);
    },
  });
  keeper.onStatus((status) => statuses.push(reasonOf(status)));
  assert.deepEqual(keeper.status(), CONNECTING);

  await until(() => keeper.current() === made[0], "the first connection");
  made[0]?.drop();
  await until(() => made.length === 2 && keeper.current() === made[1], "the second connection");

  assert.deepEqual(statuses, ["up", "lost", "up"]);
  assert.deepEqual(ups, ["up 0", "down 0", "up 1"]);
  await keeper.close();
  assert.equal(made[1]?.closed, true, "closing hangs up the connection that is up");
  assert.deepEqual(ups, ["up 0", "down 0", "up 1", "down 1"]);
  assert.equal(keeper.current(), undefined);
});

test("an attempt that fails says why and is tried again, and a reason a person can be given is passed on as it is", async () => {
  const statuses: LinkStatus[] = [];
  let attempts = 0;
  const keeper = keepConnection<Fake>({
    backoff: quick(),
    open() {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error("the socket is not there"));
      if (attempts === 2) return Promise.reject(new Down({ kind: "not-registered" }));
      return Promise.resolve(new Fake());
    },
  });
  keeper.onStatus((status) => statuses.push(status));

  await until(() => keeper.status().state === "up", "the connection");

  assert.deepEqual(statuses, [
    { state: "down", why: { kind: "unreachable", message: "the socket is not there" } },
    { state: "down", why: { kind: "not-registered" } },
    { state: "up" },
  ]);
  await keeper.close();
});

test("while an open waits for a program to be there, it says why", async () => {
  let arrive: (connection: Fake) => void = () => undefined;
  const keeper = keepConnection<Fake>({
    backoff: quick(),
    open(_signal, waiting) {
      waiting({ kind: "not-registered" });
      return new Promise<Fake>((resolve) => {
        arrive = resolve;
      });
    },
  });

  await until(() => reasonOf(keeper.status()) === "not-registered", "the waiting");
  arrive(new Fake());

  await until(() => keeper.status().state === "up", "the connection");
  await keeper.close();
});

test("closing while an open is still waiting ends it at once, and nothing is tried again", async () => {
  let attempts = 0;
  const keeper = keepConnection<Fake>({
    backoff: quick(),
    open(signal) {
      attempts += 1;
      return new Promise<Fake>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
      });
    },
  });
  await until(() => attempts === 1, "the first attempt");

  await within(1000, keeper.close(), "closing");

  assert.equal(attempts, 1);
  assert.equal(keeper.current(), undefined);
});
