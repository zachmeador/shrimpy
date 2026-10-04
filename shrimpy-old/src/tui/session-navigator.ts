import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import {
  summarizeNavigableSessions,
  type NavigableAgentSummary,
  type NavigableSessionSummary,
} from "../sessions/inventory.js";
import { AgentSessionSelectorComponent } from "./session-selector.js";
import type { TuiSessionTargetController } from "./session-target.js";

type AgentNavigatorSelection =
  | { kind: "session"; session: NavigableSessionSummary }
  | { kind: "new_session"; agent: NavigableAgentSummary };

export function createAgentSessionNavigatorExtensionFactory(options: {
  runtime: AppRuntime;
  target: TuiSessionTargetController;
}): ExtensionFactory {
  return (pi) => {
    pi.on("session_start", (_event, ctx) => {
      options.target.updateSession(
        ctx.sessionManager.getSessionFile(),
        ctx.sessionManager.getCwd(),
      );
    });

    pi.registerCommand("agents", {
      description: "Navigate agents and local sessions",
      getArgumentCompletions: (prefix) => {
        const normalized = prefix.trim().toLowerCase();
        return options.runtime.resolved.agents
          .filter((agent) => !normalized || agent.id.toLowerCase().startsWith(normalized))
          .map((agent) => ({ value: agent.id, label: agent.id }));
      },
      handler: async (args, ctx) => {
        if (ctx.mode !== "tui") {
          ctx.ui.notify("/agents is available in the TUI.", "info");
          return;
        }
        await ctx.waitForIdle();
        const search = args.trim();
        if (
          search
          && !options.runtime.resolved.agents.some((agent) =>
            agent.id.toLowerCase().includes(search.toLowerCase())
          )
        ) {
          ctx.ui.notify(`Unknown agent search: ${search}`, "warning");
          return;
        }

        const current = options.target.getTarget();
        const inventory = summarizeNavigableSessions(options.runtime, {
          currentAgentId: current.agentId,
          currentSessionFile: current.sessionFile,
        });
        const selected = await ctx.ui.custom<AgentNavigatorSelection | undefined>(
          (tui, theme, _keybindings, done) =>
            new AgentSessionSelectorComponent(
              inventory,
              theme,
              Math.max(5, Math.floor(tui.terminal.rows / 2)),
              (session) => done({ kind: "session", session }),
              () => done(undefined),
              search,
              (agent) => done({ kind: "new_session", agent }),
            ),
        );
        if (!selected) return;

        if (selected.kind === "new_session") {
          try {
            const target = await options.target.preflightNewAgent(
              selected.agent.agentId,
            );
            if (!target.sessionFile) {
              throw new Error("Pi did not allocate a local/main session path");
            }
            await ctx.switchSession(target.sessionFile, {
              withSession: (freshCtx) =>
                notifyAfterReplacement(freshCtx, options.target, "open"),
            });
          } catch (error) {
            ctx.ui.notify(
              `Cannot open ${selected.agent.agentId} local/main: ${errorMessage(error)}`,
              "error",
            );
            return;
          } finally {
            options.target.cancelPendingNewAgent();
          }
          return;
        }

        if (selected.session.current) return;

        try {
          await options.target.preflight(selected.session);
        } catch (error) {
          ctx.ui.notify(
            `Cannot open ${selected.session.agentId} ${selected.session.sessionId}: ${errorMessage(error)}`,
            "error",
          );
          return;
        }

        await ctx.switchSession(selected.session.path, {
          withSession: (freshCtx) =>
            notifyAfterReplacement(freshCtx, options.target, "switch"),
        });
      },
    });
  };
}

async function notifyAfterReplacement(
  ctx: { ui: { notify(message: string, type: "info" | "error"): void } },
  targetController: TuiSessionTargetController,
  action: "open" | "switch",
): Promise<void> {
  const result = targetController.consumeSwitchResult();
  if (result?.kind === "rolled_back") {
    ctx.ui.notify(
      `Could not ${action} ${result.attempted.agentId} ${result.attempted.sessionId}; restored ${result.target.agentId} ${result.target.sessionId}: ${result.error}`,
      "error",
    );
    return;
  }
  const target = targetController.getTarget();
  ctx.ui.notify(
    action === "open"
      ? `Opened ${target.agentId} · ${target.sessionId}`
      : `Switched to ${target.agentId} · ${target.sessionId}`,
    "info",
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
