import type { ChannelBus } from "../channels/bus.js";
import {
  systemContent,
  textContent,
} from "../channels/index.js";
import { renderScheduledTextRun } from "../context/turn/scheduler.js";
import type { ScheduleRunDue } from "./schema.js";

export function emitChannelTargetRun(
  channelBus: ChannelBus,
  run: ScheduleRunDue,
): boolean {
  const action = run.schedule.action;
  if (action.kind !== "agent") return false;
  if (action.target.kind !== "channel") return false;

  const target = action.target;
  const contentData: Record<string, unknown> = {
    ...(target.contentData ?? {}),
    scheduleId: run.scheduleId,
    runId: run.runId,
    timestamp: run.fireTimeIso,
  };
  const content = target.contentType === "text"
    ? textContent(renderScheduledTextRun(run))
    : systemContent(contentData);

  channelBus.publish({
    channel: target.channel,
    sender: {
      kind: target.senderKind ?? "system",
      actorId: target.senderActorId ?? "system:scheduler",
      userId: target.senderUserId,
      displayName: target.senderDisplayName,
    },
    origin: {
      transport: "scheduler",
      scheduleId: run.scheduleId,
      runId: run.runId,
      sourceChannel: target.channel,
      addressedAgentId: target.addressedAgentId,
    },
    content,
  });
  return true;
}
