import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { cmdUsers } from "../dist/commands/users.js";
import { setupInit } from "../dist/setup/init.js";
import { UserPresenceStore } from "../dist/surfaces/shared/user-presence.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-users-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("cmdUsers", () => {
  test("lists recorded user presence as JSON", async () => {
    await setupInit(workspace);
    new UserPresenceStore(join(workspace, "state", "user-presence.json")).record({
      userId: "alice",
      channel: "telegram~main~4242",
      surface: "telegram.main",
      transport: "telegram",
      transportChatId: "4242",
    });

    const { result, lines } = await captureLogs(() =>
      cmdUsers(["presence", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const entries = JSON.parse(lines.join("\n"));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].userId, "alice");
    assert.equal(entries[0].channel, "telegram~main~4242");
    assert.equal(entries[0].surface, "telegram.main");
  });
});
