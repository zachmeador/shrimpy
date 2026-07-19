import { resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import {
  prepareForegroundSessionOpen,
  type PreparedForegroundSessionOpen,
} from "../sessions/foreground.js";
import { formatSessionId, parseSessionId } from "../sessions/identity.js";
import { ensureSessionManifest } from "../sessions/manifest.js";
import type {
  OpenSessionRuntimeTarget,
  SessionRuntimeFactoryInput,
} from "../sessions/open.js";
import { summarizeNavigableSessions, type NavigableSessionSummary } from "../sessions/catalog.js";

export interface ShrimpyTuiTarget {
  agentId: string;
  sessionId: string;
  purpose: string;
  cwd: string;
  sessionFile?: string;
}

export interface ShrimpyTuiTargetSource {
  getTarget(): ShrimpyTuiTarget;
}

export type TuiSessionSwitchResult =
  | { kind: "switched"; target: ShrimpyTuiTarget }
  | {
    kind: "rolled_back";
    target: ShrimpyTuiTarget;
    attempted: { agentId: string; sessionId: string };
    error: string;
  };

interface PreparedTarget {
  prepared: PreparedForegroundSessionOpen;
}

interface PreparedNewTarget extends PreparedTarget {
  sessionManager: SessionManager;
}

interface TuiSessionTargetControllerDependencies {
  prepareTarget?: (
    summary: NavigableSessionSummary,
  ) => Promise<PreparedForegroundSessionOpen>;
  prepareNewTarget?: (
    agentId: string,
  ) => Promise<PreparedForegroundSessionOpen>;
  findSessionByDir?: (
    sessionDir: string,
  ) => NavigableSessionSummary | undefined;
}

export class TuiSessionTargetController implements ShrimpyTuiTargetSource {
  private currentPrepared: PreparedForegroundSessionOpen;
  private currentTarget: ShrimpyTuiTarget;
  private readonly preparedBySessionDir = new Map<string, PreparedTarget>();
  private pendingNewTarget?: PreparedNewTarget;
  private lastSwitchResult?: TuiSessionSwitchResult;

  constructor(
    private readonly runtime: AppRuntime,
    initial: PreparedForegroundSessionOpen,
    private readonly dependencies: TuiSessionTargetControllerDependencies = {},
  ) {
    this.currentPrepared = initial;
    this.currentTarget = targetFromPrepared(initial);
    const storage = initial.plan.descriptor.storage;
    if (storage.kind === "durable") {
      this.preparedBySessionDir.set(resolve(storage.dir), { prepared: initial });
    }
  }

  getTarget(): ShrimpyTuiTarget {
    return { ...this.currentTarget };
  }

  updateSession(sessionFile: string | undefined, cwd: string): void {
    this.currentTarget = {
      ...this.currentTarget,
      cwd,
      ...(sessionFile ? { sessionFile } : {}),
    };
  }

  async preflight(summary: NavigableSessionSummary): Promise<void> {
    const prepared = await this.prepareSummary(summary);
    this.preparedBySessionDir.set(resolve(summary.sessionDir), {
      prepared,
    });
  }

  async preflightNewAgent(agentId: string): Promise<ShrimpyTuiTarget> {
    const prepared = this.dependencies.prepareNewTarget
      ? await this.dependencies.prepareNewTarget(agentId)
      : await prepareForegroundSessionOpen({
        runtime: this.runtime,
        agentId,
        session: { namespace: "local", name: "main" },
        purpose: "interactive",
        persistent: true,
      });
    const storage = prepared.plan.descriptor.storage;
    if (storage.kind !== "durable") {
      throw new Error(`Cannot create an in-memory TUI session for agent ${agentId}`);
    }
    ensureSessionManifest(prepared.plan.descriptor);
    const sessionManager = SessionManager.create(prepared.cwd, storage.dir);
    this.preparedBySessionDir.set(resolve(storage.dir), { prepared });
    this.pendingNewTarget = { prepared, sessionManager };
    return targetFromPrepared(prepared, sessionManager.getSessionFile());
  }

  cancelPendingNewAgent(): void {
    this.pendingNewTarget = undefined;
  }

  consumeSwitchResult(): TuiSessionSwitchResult | undefined {
    const result = this.lastSwitchResult;
    this.lastSwitchResult = undefined;
    return result;
  }

  createRuntime = async (
    input: SessionRuntimeFactoryInput,
    openTarget: OpenSessionRuntimeTarget,
  ) => {
    if (!input.sessionStartEvent) {
      return openTarget({
        bootstrap: this.currentPrepared.bootstrap,
        plan: this.currentPrepared.plan,
      }, input);
    }

    const previousPrepared = this.currentPrepared;
    const previousTarget = this.getTarget();
    this.lastSwitchResult = undefined;

    if (
      input.sessionStartEvent.reason === "resume"
      && this.pendingNewTarget
      && resolve(input.sessionManager.getSessionDir())
        === resolve(this.pendingNewTarget.sessionManager.getSessionDir())
    ) {
      const requested = this.pendingNewTarget;
      this.pendingNewTarget = undefined;
      return this.replaceRuntime(
        requested.prepared,
        {
          ...input,
          cwd: requested.prepared.cwd,
          sessionManager: requested.sessionManager,
        },
        openTarget,
        previousPrepared,
        previousTarget,
      );
    }

    if (input.sessionStartEvent.reason !== "resume") {
      return openTarget({
        bootstrap: previousPrepared.bootstrap,
        plan: previousPrepared.plan,
      }, input);
    }

    const requested = await this.resolvePreparedTarget(input.sessionManager.getSessionDir());
    if (!requested) {
      return openTarget({
        bootstrap: previousPrepared.bootstrap,
        plan: previousPrepared.plan,
      }, input);
    }

    return this.replaceRuntime(
      requested.prepared,
      input,
      openTarget,
      previousPrepared,
      previousTarget,
    );
  };

  private async replaceRuntime(
    requestedPrepared: PreparedForegroundSessionOpen,
    input: SessionRuntimeFactoryInput,
    openTarget: OpenSessionRuntimeTarget,
    previousPrepared: PreparedForegroundSessionOpen,
    previousTarget: ShrimpyTuiTarget,
  ) {
    const requestedTarget = targetFromPrepared(
      requestedPrepared,
      input.sessionManager.getSessionFile(),
    );
    const crossingTarget = !sameTarget(previousTarget, requestedTarget);
    this.setCurrent(requestedPrepared, requestedTarget);

    try {
      const opened = await openTarget({
        bootstrap: requestedPrepared.bootstrap,
        plan: requestedPrepared.plan,
      }, input);
      if (crossingTarget) {
        this.lastSwitchResult = {
          kind: "switched",
          target: this.getTarget(),
        };
      }
      return opened;
    } catch (error) {
      this.setCurrent(previousPrepared, previousTarget);
      const previousSessionFile = input.sessionStartEvent?.previousSessionFile;
      if (!crossingTarget || !previousSessionFile) throw error;

      const rollbackManager = SessionManager.open(previousSessionFile);
      try {
        const opened = await openTarget({
          bootstrap: previousPrepared.bootstrap,
          plan: previousPrepared.plan,
        }, {
          ...input,
          cwd: rollbackManager.getCwd(),
          sessionManager: rollbackManager,
          sessionStartEvent: {
            type: "session_start",
            reason: "resume",
            previousSessionFile: input.sessionManager.getSessionFile(),
          },
        });
        this.lastSwitchResult = {
          kind: "rolled_back",
          target: this.getTarget(),
          attempted: {
            agentId: requestedTarget.agentId,
            sessionId: requestedTarget.sessionId,
          },
          error: errorMessage(error),
        };
        return opened;
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Failed to switch to ${requestedTarget.agentId} ${requestedTarget.sessionId} and failed to restore ${previousTarget.agentId} ${previousTarget.sessionId}`,
        );
      }
    }
  }

  private async resolvePreparedTarget(
    sessionDir: string,
  ): Promise<PreparedTarget | undefined> {
    const key = resolve(sessionDir);
    const cached = this.preparedBySessionDir.get(key);
    if (cached) return cached;

    const summary = this.dependencies.findSessionByDir
      ? this.dependencies.findSessionByDir(key)
      : summarizeNavigableSessions(this.runtime).agents
        .flatMap((agent) => agent.sessions)
        .find((session) => resolve(session.sessionDir) === key);
    if (!summary) return undefined;

    const prepared = await this.prepareSummary(summary);
    const target = { prepared };
    this.preparedBySessionDir.set(key, target);
    return target;
  }

  private prepareSummary(
    summary: NavigableSessionSummary,
  ): Promise<PreparedForegroundSessionOpen> {
    if (this.dependencies.prepareTarget) {
      return this.dependencies.prepareTarget(summary);
    }
    const key = parseSessionId(summary.agentId, summary.sessionId);
    return prepareForegroundSessionOpen({
      runtime: this.runtime,
      agentId: summary.agentId,
      session: {
        namespace: key.namespace,
        name: key.name,
        profileId: key.profileId,
      },
      purpose: summary.purpose,
      persistent: true,
    });
  }

  private setCurrent(
    prepared: PreparedForegroundSessionOpen,
    target: ShrimpyTuiTarget,
  ): void {
    this.currentPrepared = prepared;
    this.currentTarget = { ...target };
  }
}

function targetFromPrepared(
  prepared: PreparedForegroundSessionOpen,
  sessionFile?: string,
): ShrimpyTuiTarget {
  return {
    agentId: prepared.agentId,
    sessionId: formatSessionId(prepared.plan.descriptor.key),
    purpose: prepared.plan.descriptor.purpose,
    cwd: prepared.cwd,
    ...(sessionFile ? { sessionFile } : {}),
  };
}

function sameTarget(left: ShrimpyTuiTarget, right: ShrimpyTuiTarget): boolean {
  return left.agentId === right.agentId && left.sessionId === right.sessionId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
