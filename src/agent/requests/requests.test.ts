import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, type Message } from "@earendil-works/pi-ai";
import { type RequestMessage, Session } from "../../contracts/agent/index.ts";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { homeContext } from "../context/durable.ts";
import { digestText, homePaths } from "../home/index.ts";
import { openHost } from "../host/durable.ts";
import { openSession } from "../records/durable.ts";
import { createSessions } from "../sessions/durable.ts";
import {
  fauxModels,
  leaveBreadcrumb,
  type ObservedProviderRequest,
  roomWith,
  startAgentRig,
} from "../testing/index.ts";
import { createRequests } from "./durable.ts";

const timeout = 60_000;
const context = BACKGROUND_CONTEXT;

test("captured requests match the exact provider payload across tool rounds and survive agent restart", { timeout }, async (t) => {
  const observed: ObservedProviderRequest[] = [];
  const home = tempDir(t, "requests-ground-truth");
  const paths = homePaths(home);
  writeFileSync(paths.config, JSON.stringify({ name: "scout" }));
  writeFileSync(paths.soul, "You are Scout, a careful observer.\n");
  mkdirSync(paths.context, { recursive: true });
  writeFileSync(join(paths.context, "notes.md"), "Remember the north star.\n");
  const skillDir = join(paths.skills, "custom-note");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\ndescription: Custom skill for testing\n---\nDetails.\n");

  const rig = await startAgentRig(t, {
    home,
    scenario: "chat",
    tokensPerSecond: 100_000,
    onRequest: (req) => observed.push(req),
  });

  // "files" triggers a tool round (`bash`) followed by a second model call for the final answer.
  await rig.receiptOn(await rig.say("check the files please"));
  assert.equal(observed.length, 2, "expected 2 model requests (tool call + final answer)");

  const { session } = await rig.attach();
  const page = await session.requests({ limit: 10 });
  assert.equal(page.before, null);
  assert.equal(page.items.length, 2);

  // Newest first: item 0 is the final answer, item 1 is the tool-calling request.
  const [newest, oldest] = page.items;
  assert.ok(newest !== undefined && oldest !== undefined);
  assert.equal(oldest.captured, true);
  assert.equal(newest.captured, true);
  assert.equal(oldest.outcome.kind, "ended");
  assert.equal(oldest.outcome.how, "called_tools");
  assert.equal(newest.outcome.kind, "ended");
  assert.equal(newest.outcome.how, "finished");
  assert.ok(oldest.assistantEntry !== null && newest.assistantEntry !== null);
  assert.ok(newest.assistantEntry > oldest.assistantEntry);

  // Verify cursor pagination returns the two requests one by one.
  const p1 = await session.requests({ limit: 1 });
  assert.equal(p1.items.length, 1);
  assert.equal(p1.items[0]!.id, newest.id);
  assert.equal(p1.before, newest.id);
  const p2 = await session.requests({ before: p1.before, limit: 1 });
  assert.equal(p2.items.length, 1);
  assert.equal(p2.items[0]!.id, oldest.id);
  assert.equal(p2.before, null);

  // Inspect both requests and compare directly against what the faux provider received.
  const req1 = await session.request({ id: oldest.id });
  const req2 = await session.request({ id: newest.id });
  const latest = await session.request();
  const byEntry = await session.request({ entry: newest.assistantEntry });
  assert.ok(req1 !== null && req2 !== null && latest !== null && byEntry !== null);
  assert.deepEqual(latest, req2, "default request() returns latest captured request");
  assert.deepEqual(byEntry, req2, "request({ entry }) resolves the request behind that assistant entry");

  assertMessagesMatchProvider(req1.effectiveMessages, observed[0]!.messages);
  assertMessagesMatchProvider(req2.effectiveMessages, observed[1]!.messages);

  // Offered tools match the provider's tool loadout in exact order, with extension attribution.
  assert.deepEqual(
    req1.tools.map((tool) => tool.name),
    observed[0]!.tools.map((tool) => tool.name),
  );
  assert.deepEqual(
    req1.tools.map((tool) => tool.parameters),
    observed[0]!.tools.map((tool) => JSON.stringify(tool.parameters)),
  );
  assert.equal(req1.tools.find((tool) => tool.name === "read")?.extension, "file-tools");
  assert.equal(req1.tools.find((tool) => tool.name === "bash")?.extension, "processes");
  assert.equal(req1.tools.find((tool) => tool.name === "history")?.extension, "history");

  // Sections include source revisions for shrimpy, soul, context, and skills.
  const sectionByKey = new Map(req1.sections.map((section) => [section.key, section]));
  assert.equal(sectionByKey.get("shrimpy")?.revisionRecorded, true);
  assert.equal(sectionByKey.get("soul")?.revisionRecorded, true);
  assert.equal(sectionByKey.get("soul")?.sources[0]?.path, "SOUL.md");
  assert.equal(sectionByKey.get("soul")?.sources[0]?.origin, "home");
  assert.equal(sectionByKey.get("soul")?.sources[0]?.sha256, digestText("You are Scout, a careful observer.\n"));
  assert.equal(sectionByKey.get("context")?.sources[0]?.path, "context/notes.md");
  assert.ok(sectionByKey.get("skills")?.sources.some((src) => src.path === "skills/custom-note/SKILL.md" && src.origin === "home"));
  assert.ok(sectionByKey.get("skills")?.sources.some((src) => src.origin === "shipped"));

  // Model, settings, budgets, and raw entries are populated cleanly.
  assert.equal(req1.settings.provider, observed[0]!.model.provider);
  assert.equal(req1.settings.id, observed[0]!.model.id);
  assert.equal(req1.settings.modelSource, "home");
  assert.equal(req1.settings.steeringMode, "all");
  assert.equal(req1.settings.followUpMode, "all");
  assert.ok(req1.budget.contextWindow !== null && req1.budget.contextWindow > 0);
  assert.ok(req1.budget.compaction !== null && req1.budget.compaction.enabled);
  assert.ok(req1.budget.estimatedTokens !== null && req1.budget.estimatedTokens > 0);
  assert.equal(req1.budget.inputs.length, 1);
  assert.equal(req1.budget.inputs[0]!.source, "chat");
  assert.ok(req2.rawEntries.some((entry) => entry.kind === "tool_result" && entry.status === "included"));

  // Stop and restart the agent on the same home: reconstructed requests remain identical.
  await rig.agent.close({ now: true });
  const restarted = await startAgentRig(t, {
    home,
    chat: rig.chat,
    scenario: "chat",
    tokensPerSecond: 100_000,
  });
  const { session: afterRestart } = await restarted.attach(rig.thread.id);
  const restartedPage = await afterRestart.requests({ limit: 10 });
  assert.equal(restartedPage.items.length, 2);
  const restartedReq2 = await afterRestart.request({ id: newest.id });
  assert.deepEqual(restartedReq2, req2, "reconstructed request after restart matches live request");
});

test("captures post-beforeRequest hook deltas after compaction and records before_head and edited-entry omissions", { timeout }, async (t) => {
  const observed: ObservedProviderRequest[] = [];
  const script = (messages: readonly Message[]) => {
    const system = messages[0]?.role === "system" ? textOf(messages[0].content) : "";
    if (system.includes("context summarization assistant")) {
      return fauxAssistantMessage("## Goal\nCompacted earlier work.");
    }
    const lastUser = messages.findLast((m) => m.role === "user");
    const lastText = lastUser === undefined ? "" : textOf(lastUser.content);
    if (lastText.includes("FILLER_TURN")) {
      return fauxAssistantMessage(`Filler reply. ${"alpha ".repeat(4_500)}`);
    }
    return fauxAssistantMessage("Done.");
  };

  const rig = await startAgentRig(t, {
    script,
    contextWindow: 40_000,
    tokensPerSecond: 1_000_000,
    tokenSize: { min: 5_000, max: 10_000 },
    onRequest: (req) => {
      const system = req.messages[0]?.role === "system" ? textOf(req.messages[0].content) : "";
      if (!system.includes("context summarization assistant")) observed.push(req);
    },
  });

  await rig.receiptOn(await rig.say("FIRST_TURN"));
  await rig.receiptOn(await rig.say(`FILLER_TURN ${"beta ".repeat(10_000)}`));
  await rig.receiptOn(await rig.say(`AFTER_COMPACT ${"gamma ".repeat(6_000)}`));

  const { session } = await rig.attach();
  const latest = await session.request();
  assert.ok(latest !== null);
  assert.equal(latest.summary.compacted, true, "turn 3 followed a blocking compaction");

  // Reconstructed effectiveMessages matches the exact provider messages, including `compactionNoteHook`'s reminder.
  const actualLast = observed.at(-1)!;
  assertMessagesMatchProvider(latest.effectiveMessages, actualLast.messages);

  const hooked = latest.effectiveMessages.filter((msg) => msg.modifiedByHook);
  assert.equal(hooked.length, 1, "only the compaction summary message was modified by beforeRequest");
  assert.equal(hooked[0]!.role, "user");
  const hookedText = hooked[0]!.blocks.map((block) => (block.type === "text" ? block.text : "")).join("");
  assert.ok(hookedText.includes("Earlier messages and tool outputs from before this compaction are still searchable"));

  // Unmodified messages remain false.
  assert.ok(latest.effectiveMessages.some((msg) => msg.role === "user" && !msg.modifiedByHook));

  // Omissions include `before_head` (compaction) and `entry_edited` (baseline pi.system omitting earlier pi.system).
  const beforeHead = latest.omissions.find((omission) => omission.kind === "before_head");
  assert.ok(beforeHead !== undefined);
  assert.equal(beforeHead.headKind, "compaction");
  assert.equal(beforeHead.reason, "threshold");
  assert.ok(beforeHead.omittedEntries > 0);
});

test("tracks per-request source revisions across reloads, home/input omissions, and excluded failed assistant entries", { timeout }, async (t) => {
  const home = tempDir(t, "requests-revisions-omissions");
  const paths = homePaths(home);
  // Wake only on mentions in #ops so unmentioned chatter builds an unseen backlog before the waking mention.
  writeFileSync(paths.config, JSON.stringify({ name: "scout", wake: { ops: "mentions" } }));
  mkdirSync(paths.context, { recursive: true });
  const noteFile = join(paths.context, "guide.md");
  writeFileSync(noteFile, "Guide version ONE.\n");

  // Broken skill (missing frontmatter) produces a `home_file` omission and a `_left-out.md` breadcrumb.
  const brokenSkill = join(paths.skills, "broken");
  mkdirSync(brokenSkill, { recursive: true });
  writeFileSync(join(brokenSkill, "SKILL.md"), "No frontmatter here.\n");

  const rig = await startAgentRig(t, {
    home,
    scenario: "mixed",
    tokensPerSecond: 100_000,
    lookEveryMs: 60_000,
  });

  // Create a room with scout where we can seed a >20k backlog before waking scout.
  const room = await roomWith(t, rig.chat, "ops", [rig.partner]);
  // Leave 11 breadcrumbs (+ `_left-out.md` = 12 total; cap is 10 -> 2 deferred), with the first >1,000 chars (truncated).
  leaveBreadcrumb(home, "01-huge", "X".repeat(1_400));
  for (let i = 2; i <= 11; i += 1) {
    leaveBreadcrumb(home, `${String(i).padStart(2, "0")}-crumb`, `Crumb ${String(i)}`);
  }

  // Post 6 unmentioned messages of ~5,000 chars each (~30,000 chars total > 20,000 backlog budget).
  for (let i = 1; i <= 6; i += 1) {
    await rig.say(`Unseen chatter ${String(i)}: ${"w".repeat(5_000)}`, room.pinned.id);
  }

  // Wake scout in the room -> captures Guide v1, home_file omission, backlog_cut, breadcrumb_deferred, breadcrumb_truncated.
  await rig.receiptOn(await rig.say("@scout hello in ops", room.pinned.id));

  // Trigger a failed turn ("refuse") in the same room thread so Pi writes a stopReason="error" assistant entry.
  await rig.receiptOn(await rig.say("@scout refuse", room.pinned.id));

  // Update guide.md to version TWO, reload the agent, and run another turn.
  writeFileSync(noteFile, "Guide version TWO with updated instructions.\n");
  const connection = await rig.connect();
  await connection.reload();
  await rig.receiptOn(await rig.say("@scout second check", room.pinned.id));

  const session = await connection.attach(room.pinned.id);
  const page = await session.requests({ limit: 10 });
  // Requests: turn 1 (answered), turn 2 (failed), turn 3 (answered) -> newest first.
  assert.equal(page.items.length, 3);
  const [req3Summary, _req2Summary, req1Summary] = page.items;
  assert.ok(req1Summary !== undefined && req3Summary !== undefined);

  const req1 = await session.request({ id: req1Summary.id });
  const req3 = await session.request({ id: req3Summary.id });
  assert.ok(req1 !== null && req3 !== null);

  // Source revision pinning: req1 still points to Guide version ONE even after reload to version TWO.
  const req1Guide = req1.sections.find((s) => s.key === "context")?.sources.find((s) => s.path === "context/guide.md");
  const req3Guide = req3.sections.find((s) => s.key === "context")?.sources.find((s) => s.path === "context/guide.md");
  assert.equal(req1Guide?.sha256, digestText("Guide version ONE.\n"));
  assert.equal(req3Guide?.sha256, digestText("Guide version TWO with updated instructions.\n"));

  // Home omission recorded.
  assert.ok(
    req1.omissions.some((o) => o.kind === "home_file" && o.file === "skills/broken/SKILL.md" && !o.carriedOver),
    JSON.stringify(req1.omissions),
  );

  // Backlog budget & cut recorded.
  const backlogCut = req1.omissions.find((o) => o.kind === "backlog_cut");
  assert.ok(backlogCut !== undefined, JSON.stringify(req1.omissions));
  assert.equal(backlogCut.budgetChars, 20_000);
  assert.ok(backlogCut.cut > 0);
  assert.equal(req1.budget.inputs[0]!.backlogBudgetChars, 20_000);
  assert.equal(req1.budget.inputs[0]!.breadcrumbsShown, 10);
  assert.equal(req1.budget.inputs[0]!.breadcrumbsLimit, 10);

  // Breadcrumb deferred (2) and truncated (01-huge.md > 1,000 chars) recorded.
  const deferred = req1.omissions.find((o) => o.kind === "breadcrumb_deferred");
  assert.ok(deferred !== undefined);
  assert.equal(deferred.deferred, 2);
  assert.equal(deferred.limit, 10);

  const truncated = req1.omissions.find((o) => o.kind === "breadcrumb_truncated");
  assert.ok(truncated !== undefined);
  assert.equal(truncated.file, "breadcrumbs/01-huge.md");
  assert.equal(truncated.limitChars, 1_000);
  assert.equal(truncated.originalChars, 1_400);

  // Turn 3 sees Turn 2's failed assistant entry as `excluded_stop_reason` in rawEntries and `entry_excluded` in omissions.
  assert.ok(
    req3.rawEntries.some((entry) => entry.kind === "assistant" && entry.status === "excluded_stop_reason" && entry.statusDetail === "error"),
    JSON.stringify(req3.rawEntries.map(({ id, kind, status, statusDetail }) => ({ id, kind, status, statusDetail }))),
  );
  assert.ok(
    req3.omissions.some((o) => o.kind === "entry_excluded" && o.stopReason === "error"),
    JSON.stringify(req3.omissions),
  );
});

test("refuses Session.requests and Session.request to a non-admin agent", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "chat", tokensPerSecond: 100_000 });
  await rig.receiptOn(await rig.say("hello scout"));

  // Second agent on the roster is not an admin and may not watch scout's session.
  const maya = await rig.chat.agent("maya");
  const held = await maya.host.get(Session, { agent: rig.partner.id, session: rig.thread.id }, context);
  stopAfter(t, () => held.release());
  assert.notEqual(held.refusal.value, null);
  assert.equal((await held.requests({ limit: 10 }, context)).kind, "refused");
  assert.equal((await held.request({}, context)).kind, "refused");
});

test("reconstructs unrecorded turns gracefully when capture did not run (pre-upgrade or failed capture)", { timeout }, async (t) => {
  const home = tempDir(t, "requests-unrecorded");
  const { models, model } = fauxModels({ home, scenario: "chat", tokensPerSecond: 100_000 });

  // Run a turn with NO requests extension installed, simulating a pre-upgrade turn or failed capture hook.
  const host1 = await openHost({ home, models });
  const defaults = { model, cwd: home };
  const sessions1 = createSessions(host1.harness, defaults, models);
  host1.resume();
  await host1.harness.commit(async (tx) => {
    await openSession(tx, defaults, { threadId: "th_legacy", channelId: "ch_1" });
  }, context);
  const { submission } = await sessions1.steer("th_legacy", "hello before capture", "req-legacy", context);
  const settled = await sessions1.wait("th_legacy", submission, context);
  assert.equal(settled.status, "answered");
  await host1.close();

  // Reopen with request inspection enabled and inspect the unrecorded turn.
  const host2 = await openHost({ home, models });
  stopAfter(t, () => host2.close());
  const ctx = await homeContext({ name: "scout", home });
  const requests = createRequests(host2.harness, {
    context: ctx,
    homeModel: () => ({ model, fromHome: true }),
  });

  const page = await requests.list("th_legacy", { limit: 10 }, context);
  assert.equal(page.items.length, 1);
  const [item] = page.items;
  assert.ok(item !== undefined);
  assert.equal(item.captured, false);
  assert.ok(item.id.startsWith("entry:"));
  assert.ok(item.assistantEntry !== null);
  assert.equal(item.outcome.kind, "ended");
  assert.equal(item.outcome.how, "finished");

  const rebuilt = await requests.inspect("th_legacy", { entry: item.assistantEntry }, context);
  assert.ok(rebuilt !== null);
  assert.equal(rebuilt.summary.captured, false);
  assert.equal(rebuilt.settings.modelSource, "unknown");
  assert.ok(rebuilt.effectiveMessages.some((m) => m.role === "user" && m.blocks.some((b) => b.type === "text" && b.text.includes("hello before capture"))));
  assert.ok(rebuilt.tools.some((tool) => tool.name === "read"));
});

/** Assert Shrimpy's reconstructed `effectiveMessages` matches the exact messages Pi passed to the provider. */
function assertMessagesMatchProvider(reconstructed: readonly RequestMessage[], provider: readonly Message[]): void {
  assert.equal(reconstructed.length, provider.length, "effective message count matches provider");
  for (let i = 0; i < provider.length; i += 1) {
    const actual = provider[i]!;
    const got = reconstructed[i]!;
    assert.equal(got.role, actual.role, `message ${String(i)} role matches`);
    if (actual.role === "system" && got.role === "system") {
      const expectedSections = actual.sections === undefined ? [] : Object.entries(actual.sections).map(([key, value]) => ({ key, value }));
      assert.deepEqual(got.sections, expectedSections, `system message ${String(i)} sections match`);
      assert.deepEqual(got.toolsAdded, (actual.toolsAdded ?? []).map((t) => t.name));
      assert.deepEqual(got.toolsRemoved, (actual.toolsRemoved ?? []).map((t) => t.name));
    } else if (actual.role === "user" && got.role === "user") {
      const actualText = textOf(actual.content);
      const gotText = got.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
      assert.equal(gotText, actualText, `user message ${String(i)} text matches provider exactly`);
    } else if (actual.role === "assistant" && got.role === "assistant") {
      assert.equal(got.stopReason, actual.stopReason);
      const actualCalls = actual.content.filter((b) => b.type === "toolCall").map((b) => b.name);
      const gotCalls = got.blocks.filter((b) => b.type === "toolCall").map((b) => b.name);
      assert.deepEqual(gotCalls, actualCalls);
    } else if (actual.role === "toolResult" && got.role === "toolResult") {
      assert.equal(got.toolCallId, actual.toolCallId);
      assert.equal(got.toolName, actual.toolName);
      assert.equal(got.isError, actual.isError);
      const actualText = textOf(actual.content);
      const gotText = got.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
      assert.equal(gotText, actualText, `toolResult ${String(i)} text matches provider exactly`);
    }
  }
}

function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}
