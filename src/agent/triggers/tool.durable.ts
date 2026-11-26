import type { Context } from "@earendil-works/chord/context";
import { defineExtension, defineTool, type Extension, type ToolExecutionApi } from "@earendil-works/pi-durable";
import { obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import { describeSchedule, type OnceTrigger, type TriggerSummary } from "../../contracts/agent/index.ts";
import {
  draftTrigger,
  NoTriggerError,
  removeTrigger,
  saveTrigger,
  switchTrigger,
  type TriggerCheck,
  TriggerFileError,
} from "../../contracts/agent/node.ts";
import { asError } from "../../lib/errors/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { howLong, localTime } from "../../lib/time/index.ts";
import { answer, failure } from "../host/durable.ts";
import { CAN_END_TURN, type Place } from "../inputs/index.ts";
import { threadOfSession } from "../records/durable.ts";
import type { OnceScheduled } from "./once.durable.ts";
import { readWhen } from "./when.ts";

/** Maximum characters in a one-shot trigger's prompt. */
const MAX_ONCE_PROMPT = 4_000;
const THREAD_ID = /^th_[0-9a-z]{12}$/;

const TRIGGER_DESCRIPTION =
  "Schedule, list, pause, resume, or remove triggers. " +
  "Use action: \"add\" with in/at for a one-time wakeup (defaults to this thread) or with name + every/cron for a recurring trigger (defaults to this thread unless then: \"note\"). " +
  "Use pause/resume with a standing trigger's name, and remove with either a standing trigger's name or a one-time trigger's ID (once_...).";

export interface TriggerToolRuntime {
  home: string;
  triggerCheck: TriggerCheck;
  listStanding(): Promise<TriggerSummary[]>;
  listOnce(): Promise<OnceTrigger[]>;
  scheduleOnce(
    api: ToolExecutionApi,
    target: { threadId: string; channelId: string; place?: Place },
    request: { askedAt: number; due: number; prompt: string },
    at: Context,
  ): Promise<OnceScheduled>;
  cancelOnce(id: string): Promise<void>;
  channelOf(threadId: string, signal: AbortSignal): Promise<{ channelId: string; place?: Place } | { problem: string }>;
  reloadFiles(): Promise<void>;
}

/** Build the unified `trigger` tool extension. */
export function triggerTool(runtime: TriggerToolRuntime): Extension {
  const tool = defineTool({
    name: "trigger",
    description: TRIGGER_DESCRIPTION,
    parameters: obj({
      action: oneOf(["add", "list", "pause", "resume", "remove"] as const, {
        description: "What to do: add, list, pause, resume, or remove a trigger.",
      }),
      name: opt(str({ description: "Trigger name (for standing add/pause/resume/remove) or one-time ID once_... (for remove)." })),
      in: opt(str({ description: "One-time delay, e.g. 30s, 5m, 2h, 1d." })),
      at: opt(str({ description: "One-time ISO 8601 timestamp with offset, e.g. 2026-10-05T09:00:00-04:00." })),
      every: opt(str({ description: "Recurring interval, e.g. 15m, 1h, 1d (at least 1m)." })),
      cron: opt(str({ description: "Five-field cron schedule, e.g. \"0 8 * * *\"." })),
      timezone: opt(str({ description: "IANA time zone for cron, e.g. America/New_York." })),
      prompt: opt(str({ description: "Instructions to wake with when the trigger fires (optional only for then: note)." })),
      thread: opt(str({ description: "Target thread ID (th_...). Defaults to the current thread (omit for then: note)." })),
      overlap: opt(oneOf(["skip", "allow"] as const, { description: "For recurring triggers: skip or allow overlapping occurrences (default skip)." })),
      check: opt(str({ description: "One-line shell check command run before waking on a recurring trigger." })),
      when: opt(oneOf(["changed", "output", "always"] as const, { description: "What counts as news for check (default changed)." })),
      then: opt(oneOf(["wake", "note"] as const, { description: "wake this thread (default) or note to breadcrumbs/<name>.md." })),
      timeout: opt(str({ description: "Check timeout, e.g. 30s or 2m (default 1m, max 10m)." })),
    }),
    executionMode: "sequential",
    async execute(args, api, context) {
      switch (args.action) {
        case "list":
          return handleList(runtime);
        case "add":
          return handleAdd(args, runtime, api, context);
        case "pause":
        case "resume":
          return handleSwitch(args.name, args.action === "resume", runtime);
        case "remove":
          return handleRemove(args.name, runtime);
      }
    },
  });

  return defineExtension({ name: "trigger-tool", tools: [tool] });
}

async function handleList(runtime: TriggerToolRuntime) {
  const [standing, once] = await Promise.all([runtime.listStanding(), runtime.listOnce()]);
  if (standing.length === 0 && once.length === 0) return answer("No triggers are set.");
  const lines: string[] = [];
  if (standing.length > 0) {
    lines.push("Standing triggers:");
    for (const t of standing) {
      const state = t.on ? "on" : "off";
      const target = t.thread === null ? `breadcrumbs/${t.name}.md` : `thread ${t.thread}`;
      const next = t.next === null ? "paused" : `next ${localTime(t.next)}`;
      lines.push(`- ${t.name} (${state}, ${describeSchedule(t.schedule)}, ${target}, ${next})`);
    }
  }
  if (once.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("One-time triggers:");
    for (const o of once) {
      lines.push(`- ${o.id} at ${localTime(o.due)} in ${o.threadId}: ${oneLine(o.prompt)}`);
    }
  }
  return answer(lines.join("\n"));
}

async function handleAdd(
  args: {
    name?: string;
    in?: string;
    at?: string;
    every?: string;
    cron?: string;
    timezone?: string;
    prompt?: string;
    thread?: string;
    overlap?: "skip" | "allow";
    check?: string;
    when?: "changed" | "output" | "always";
    then?: "wake" | "note";
    timeout?: string;
  },
  runtime: TriggerToolRuntime,
  api: ToolExecutionApi,
  context: Context,
) {
  const isOnce = args.in !== undefined || args.at !== undefined;
  const isRecurring = args.every !== undefined || args.cron !== undefined;
  if (isOnce && isRecurring) {
    return failure("Give in/at for a one-time trigger, or every/cron for a recurring trigger — not both.");
  }
  if (!isOnce && !isRecurring) {
    return failure("Say when it runs: give in/at for a one-time trigger, or name + every/cron for a recurring trigger.");
  }

  const current = await threadOfSession(api, api.conversationId, context);

  if (isOnce) {
    if (args.check !== undefined || args.then !== undefined || args.when !== undefined || args.overlap !== undefined) {
      return failure("check, when, then, and overlap are for recurring triggers (every/cron), not one-time triggers (in/at).");
    }
    const prompt = (args.prompt ?? "").trim();
    if (prompt === "") return failure("Write a prompt: what you want to do when the one-time trigger fires.");
    if (prompt.length > MAX_ONCE_PROMPT) {
      return failure(`The prompt is ${prompt.length} characters, and the most is ${MAX_ONCE_PROMPT}.`);
    }
    const askedAt = (await api.memo<number>("askedAt", context)) ?? (await api.memo("askedAt", Date.now(), context));
    const when = readWhen({ in: args.in, at: args.at }, askedAt);
    if ("problem" in when) return failure(when.problem);

    let target: { threadId: string; channelId: string; place?: Place };
    if (args.thread === undefined || (current !== undefined && args.thread.trim() === current.threadId)) {
      if (current === undefined) return failure("This session has no thread; give thread: th_....");
      target = current;
    } else {
      const wanted = args.thread.trim();
      if (!THREAD_ID.test(wanted)) return failure(`thread: ${wanted} should be a thread ID such as th_4k9x2m7q0b3d.`);
      const found = await runtime.channelOf(wanted, context.abortSignal ?? new AbortController().signal);
      if ("problem" in found) return failure(found.problem);
      target = { threadId: wanted, channelId: found.channelId, ...(found.place === undefined ? {} : { place: found.place }) };
    }

    const result = await runtime.scheduleOnce(api, target, { askedAt, due: when.due, prompt }, context);
    if ("waiting" in result) {
      return failure(`${result.waiting} one-time triggers are already waiting in that thread, which is the most allowed.`);
    }
    const { trigger } = result;
    const where = current !== undefined && trigger.threadId === current.threadId ? "in this thread" : `in thread ${trigger.threadId}`;
    return answer(
      `Scheduled one-time trigger ${trigger.id} ${where} for ${localTime(trigger.due)} (in ${howLong(trigger.due - askedAt)}). ${CAN_END_TURN}`,
    );
  }

  // Recurring standing trigger.
  const name = args.name?.trim();
  if (name === undefined || name === "") return failure("Give a name for the recurring trigger (e.g. name: \"daily-research\").");
  const notes = args.then === "note";
  const thread = notes ? args.thread : (args.thread?.trim() ?? current?.threadId);

  try {
    const draft = draftTrigger(
      name,
      {
        ...(args.every === undefined ? {} : { every: args.every }),
        ...(args.cron === undefined ? {} : { cron: args.cron }),
        ...(args.timezone === undefined ? {} : { timezone: args.timezone }),
        ...(thread === undefined ? {} : { thread }),
        ...(args.overlap === undefined ? {} : { overlap: args.overlap }),
        ...(args.check === undefined ? {} : { check: args.check }),
        ...(args.when === undefined ? {} : { when: args.when }),
        ...(args.then === undefined ? {} : { then: args.then }),
        ...(args.timeout === undefined ? {} : { timeout: args.timeout }),
        prompt: args.prompt ?? "",
      },
      runtime.triggerCheck,
    );
    const { replaced } = await saveTrigger(runtime.home, draft);
    await runtime.reloadFiles();
    const saved = (await runtime.listStanding()).find((each) => each.name === name);
    const next = saved?.next === undefined || saved.next === null ? "" : ` Next run: ${localTime(saved.next)}.`;
    const where = draft.definition.thread === null ? `breadcrumbs/${name}.md` : `thread ${draft.definition.thread}`;
    return answer(`${replaced ? "Updated" : "Scheduled"} trigger ${name} (${describeSchedule(draft.definition.schedule)}, ${where}).${next}`);
  } catch (error) {
    if (error instanceof TriggerFileError) return failure(`Nothing was written: ${error.message}.`);
    return failure(`Could not save trigger ${name}: ${asError(error).message}`);
  }
}

async function handleSwitch(rawName: string | undefined, enabled: boolean, runtime: TriggerToolRuntime) {
  const name = rawName?.trim();
  if (name === undefined || name === "") return failure(`Give name to ${enabled ? "resume" : "pause"} a standing trigger.`);
  try {
    const { changed } = await switchTrigger(runtime.home, name, enabled, runtime.triggerCheck);
    await runtime.reloadFiles();
    const verb = enabled ? "Resumed" : "Paused";
    const state = enabled ? "already on" : "already paused";
    return answer(changed ? `${verb} trigger ${name}.` : `Trigger ${name} is ${state}.`);
  } catch (error) {
    if (error instanceof NoTriggerError) return failure(error.message);
    if (error instanceof TriggerFileError) return failure(`triggers/${name}.md was not changed: ${error.message}.`);
    return failure(`Could not change trigger ${name}: ${asError(error).message}`);
  }
}

async function handleRemove(rawName: string | undefined, runtime: TriggerToolRuntime) {
  const name = rawName?.trim();
  if (name === undefined || name === "") return failure("Give name (or one-time ID once_...) to remove a trigger.");
  // Check if it's a pending one-time trigger ID first.
  const pendingOnce = await runtime.listOnce();
  if (pendingOnce.some((each) => each.id === name)) {
    try {
      await runtime.cancelOnce(name);
      return answer(`Cancelled one-time trigger ${name}.`);
    } catch (error) {
      if (isRefusal(error)) return failure(error.message);
      throw error;
    }
  }
  try {
    await removeTrigger(runtime.home, name);
    await runtime.reloadFiles();
    return answer(`Removed trigger ${name}.`);
  } catch (error) {
    if (error instanceof NoTriggerError) return failure(error.message);
    return failure(`Could not remove trigger ${name}: ${asError(error).message}`);
  }
}
