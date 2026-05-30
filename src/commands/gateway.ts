import { createAppRuntime } from "../app/index.js";
import { gatewayCtl } from "../gateway-ctl.js";
import { printGatewayLogs } from "./gateway-logs.js";
import { printGatewayStatus } from "./gateway-status.js";
import {
  createCommandGroup,
  type CommandHandler,
  type CommandInvocation,
} from "./framework.js";

const USAGE = "usage: shrimpy gateway <status|logs|install|uninstall|start|stop|restart>";

function controlGateway(action: "install" | "uninstall" | "start" | "stop" | "restart") {
  return async ({ config }: CommandInvocation): Promise<number> => {
    const runtime = createAppRuntime(config);
    await gatewayCtl(action, { pidPath: runtime.paths.gatewayPidPath });
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
