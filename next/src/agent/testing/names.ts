import { agentMember, type Member } from "../../contracts/chat/index.ts";

/** The person who talks to the agent in tests. */
export const zach: Member = { id: "person:zach", kind: "person", name: "Zach" };

/** The agent under test. */
export const scout: Member = agentMember("scout");
