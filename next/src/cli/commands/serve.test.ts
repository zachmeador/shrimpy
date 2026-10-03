import assert from "node:assert/strict";
import { test } from "node:test";
import { type CapturedIo, captureIo } from "../testing/index.ts";
import { serveUntilStopped } from "./serve.ts";

/** A program that notes in `events` when it starts and when it is closed. */
function program(events: string[]) {
  return {
    start: () => {
      events.push("start");
      return Promise.resolve({
        close: () => {
          events.push("close");
          return Promise.resolve();
        },
      });
    },
    announce: () => ({ event: "listening" }),
  };
}

/** The captured `Io`, noting in `events` when the command starts and stops listening for stop requests. */
function watched(cli: CapturedIo, events: string[]) {
  return {
    ...cli.io,
    out(line: string) {
      events.push("line");
      cli.io.out(line);
    },
    onStop(listener: () => void) {
      events.push("listen");
      const stopListening = cli.io.onStop(listener);
      return () => {
        events.push("stop listening");
        stopListening();
      };
    },
  };
}

test("it announces the program once it runs, and closes it when told to stop", async () => {
  const cli = captureIo();
  const events: string[] = [];
  const { start, announce } = program(events);

  const done = serveUntilStopped(cli.io, start, announce);
  await cli.nextOut((line) => line.includes("listening"));
  assert.deepEqual(events, ["start"]);
  cli.requestStop();

  assert.equal(await done, 0);
  assert.deepEqual(events, ["start", "close"]);
  assert.deepEqual(cli.out, ['{"event":"listening"}']);
});

test("it listens for stop requests before it starts anything, and stops listening at the end", async () => {
  const cli = captureIo();
  const events: string[] = [];
  const { start, announce } = program(events);

  const done = serveUntilStopped(watched(cli, events), start, announce);
  await cli.nextOut((line) => line.includes("listening"));
  cli.requestStop();
  await done;

  assert.deepEqual(events, ["listen", "start", "line", "close", "stop listening"]);
});

test("a stop request that comes while the program starts closes it as soon as it is announced", async () => {
  const cli = captureIo();
  const events: string[] = [];

  const done = serveUntilStopped(
    cli.io,
    () => {
      cli.requestStop();
      return program(events).start();
    },
    () => ({ event: "listening" }),
  );

  assert.equal(await done, 0);
  assert.deepEqual(events, ["start", "close"]);
  assert.equal(cli.out.length, 1);
});

test("a program that cannot start fails with its own error, says nothing, and leaves nothing listening", async () => {
  const cli = captureIo();
  const events: string[] = [];

  await assert.rejects(
    serveUntilStopped(
      watched(cli, events),
      () => Promise.reject(new Error("Another one is already running.")),
      () => ({ event: "listening" }),
    ),
    /Another one is already running\./,
  );

  assert.deepEqual(events, ["listen", "stop listening"]);
  assert.deepEqual(cli.out, []);
});
