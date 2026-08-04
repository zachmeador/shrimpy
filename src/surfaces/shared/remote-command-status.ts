import {
  flattenGatewayLanes,
  loadGatewayRuntimeState,
} from "../../gateway/runtime-state.js";
import type {
  RemoteCommandStatusDetails,
} from "./remote-commands.js";

const RECENT_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export function readGatewayRemoteCommandStatus(
  gatewayStatePath: string,
  input: {
    agentId: string;
    channel: string;
    now?: number;
  },
): RemoteCommandStatusDetails {
  const state = loadGatewayRuntimeState(gatewayStatePath);
  const lane = flattenGatewayLanes(state, {
    agentId: input.agentId,
    channel: input.channel,
  })[0];
  if (!lane) {
    return {
      lane: {
        phase: "idle",
        queueDepth: 0,
      },
    };
  }

  const queueDepth = Math.max(0, lane.queueDepth);
  if (lane.currentTurn) {
    return {
      lane: {
        phase: "running",
        queueDepth,
        runningSince: lane.currentTurn.startedAt,
      },
    };
  }
  if (queueDepth > 0) {
    return {
      lane: {
        phase: "queued",
        queueDepth,
      },
    };
  }

  const now = input.now ?? Date.now();
  if (
    lane.lastOutcome?.outcome === "errored"
    && now - lane.lastOutcome.at <= RECENT_FAILURE_WINDOW_MS
  ) {
    return {
      lane: {
        phase: "recently-failed",
        queueDepth,
        failedAt: lane.lastOutcome.at,
      },
    };
  }

  return {
    lane: {
      phase: "idle",
      queueDepth,
    },
  };
}
