import {
  createCommandGroup,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("setup");

export const cmdSetup: CommandHandler = createCommandGroup({
  name: "setup",
  usage: USAGE,
  default: async ({ config }) => {
    const { runSetupEntry } = await import("../setup/service.js");
    await runSetupEntry(config.workspace);
    return 0;
  },
  commands: {
    init: async ({ config }) => {
      const { setupInit } = await import("../setup/init.js");
      await setupInit(config.workspace);
      return 0;
    },
    telegram: async ({ config }) => {
      const { setupTelegram } = await import("../setup/telegram.js");
      await setupTelegram(config.workspace);
      return 0;
    },
  },
});
