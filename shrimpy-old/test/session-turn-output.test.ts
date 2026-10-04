import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { runSessionTurn } from "../dist/sessions/turn-output.js";

type Listener = (event: unknown) => void;

function unsubscribe(listeners: Listener[], listener: Listener): void {
  const index = listeners.indexOf(listener);
  if (index >= 0) listeners.splice(index, 1);
}

describe("runSessionTurn", () => {
  test("prompts the session and resolves assistant text from agent_end", async () => {
    const listeners: Listener[] = [];
    let promptText = "";
    const session = {
      subscribe(listener: Listener) {
        listeners.push(listener);
        return () => unsubscribe(listeners, listener);
      },
      async prompt(text: string) {
        promptText = text;
        for (const listener of [...listeners]) {
          listener({
            type: "agent_end",
            messages: [
              {
                role: "assistant",
                content: [
                  { type: "text", text: "alpha " },
                  { type: "text", text: "beta" },
                ],
              },
            ],
          });
        }
      },
    };

    const result = await runSessionTurn(session as any, "hello");

    assert.equal(promptText, "hello");
    assert.equal(result.assistantText, "alpha beta");
    assert.equal(listeners.length, 0);
  });

  test("rejects on abort and unsubscribes from session events", async () => {
    const listeners: Listener[] = [];
    const controller = new AbortController();
    const session = {
      subscribe(listener: Listener) {
        listeners.push(listener);
        return () => unsubscribe(listeners, listener);
      },
      async prompt() {
        await new Promise(() => {});
      },
    };

    const result = runSessionTurn(session as any, "wait", {
      signal: controller.signal,
      abortMessage: "fallback aborted",
    });

    assert.equal(listeners.length, 1);
    controller.abort(new Error("custom aborted"));

    await assert.rejects(result, /custom aborted/);
    assert.equal(listeners.length, 0);
  });
});
