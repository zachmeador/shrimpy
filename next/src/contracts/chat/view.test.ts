import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, personMember } from "./index.ts";

test("an agent and a person with the same name are different members", () => {
  assert.deepEqual(agentMember("scout"), { id: "agent:scout", kind: "agent", name: "scout" });
  assert.deepEqual(personMember("scout"), { id: "person:scout", kind: "person", name: "scout" });
});
