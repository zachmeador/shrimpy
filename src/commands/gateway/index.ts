import { createAppRuntime } from "../../app/runtime.js";
import { gatewayCtl } from "../../gateway/service/index.js";
import { printGatewayLogs } from "./logs.js";
import { printGatewayStatus } from "./status.js";
import { renderGroupUsage } from "../catalog.js";
import {
  createCommandGroup,
  type CommandHandler,
  type CommandInvocation,
} from "../framework.js";

const USAGE = renderGroupUsage("gateway");

function controlGateway(action: "install" | "uninstall" | "start" | "stop" | "restart") {
  return async ({ config }: CommandInvocation): Promise<number> => {
    const runtime = createAppRuntime(config);
    await gatewayCtl(action, {
      pidPath: runtime.paths.gatewayPidPath,
      workspace: config.workspace,
    });
    return 0;
  };
}

export const cmdGateway: CommandHandler = createCommandGroup({
  name: "gateway",
  usage: USAGE,
  commands: {
    status: ({ config }) => {
      printGatewayStatus(config);
      return 0;
    },
    logs: ({ argv, config }) => printGatewayLogs(config, argv),
    install: controlGateway("install"),
    uninstall: controlGateway("uninstall"),
    start: controlGateway("start"),
    stop: controlGateway("stop"),
    restart: controlGateway("restart"),
  },
});
