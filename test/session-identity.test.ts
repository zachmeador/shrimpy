import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createChannelSessionKey,
  createLocalSessionKey,
  formatSessionId,
  parseSessionId,
  sessionRootPath,
} from "../dist/sessions/identity.js";
import {
  acquireSessionLease,
  readSessionOwner,
} from "../dist/sessions/ownership.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import {
  ensureSessionManifest,
  listSessionDescriptors,
} from "../dist/sessions/manifest.js";

let workspace: string;
let agentRoot: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-session-identity-test-"));
  agentRoot = join(workspace, "agents", "shrimpy");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("session identity", () => {
  test("round-trips canonical ids with reserved characters and profiles", () => {
    const key = createChannelSessionKey({
      agentId: "shrimpy",
      channel: "dm/helper@home",
      profileId: "research/v2",
    });

    const id = formatSessionId(key);
    assert.equal(id, "channel/dm%2Fhelper%40home@research%2Fv2");
    assert.deepEqual(parseSessionId("shrimpy", id), key);
  });

  test("keeps formerly colliding labels and namespaces in different directories", () => {
    const tilde = createChannelSessionKey({ agentId: "shrimpy", channel: "a~b" });
    const underscore = createChannelSessionKey({ agentId: "shrimpy", channel: "a_b" });
    const localTui = createLocalSessionKey({ agentId: "shrimpy", name: "tui" });
    const channelTui = createChannelSessionKey({ agentId: "shrimpy", channel: "tui" });

    assert.notEqual(sessionRootPath(agentRoot, tilde), sessionRootPath(agentRoot, underscore));
    assert.notEqual(sessionRootPath(agentRoot, localTui), sessionRootPath(agentRoot, channelTui));
  });

  test("discovers durable sessions from manifests instead of directory-name guesses", () => {
    const key = createChannelSessionKey({ agentId: "shrimpy", channel: "a~b" });
    const descriptor = createSessionDescriptor({
      agentRoot,
      key,
      purpose: "channel",
      delivery: { kind: "channel", channel: "a~b" },
    });
    ensureSessionManifest(descriptor);

    assert.deepEqual(listSessionDescriptors(agentRoot), [descriptor]);
  });

  test("allows only one durable host to own a session", () => {
    const key = createLocalSessionKey({ agentId: "shrimpy", name: "main" });
    const descriptor = createSessionDescriptor({
      agentRoot,
      key,
      purpose: "interactive",
      delivery: { kind: "transcript" },
    });
    const lease = acquireSessionLease({ workspace, descriptor });
    assert.ok(lease);
    assert.equal(readSessionOwner(workspace, key)?.kind, "foreground");
    assert.throws(
      () => acquireSessionLease({ workspace, descriptor }),
      /owned by foreground process/,
    );

    lease.release();
    assert.equal(readSessionOwner(workspace, key), undefined);
  });
});
