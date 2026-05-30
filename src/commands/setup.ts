import {
  createCommandGroup,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy setup
  shrimpy setup init
  shrimpy setup telegram`;

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
      const { setupInit } = await import("../setup.js");
      await setupInit(config.workspace);
      return 0;
    },
    telegram: async ({ config }) => {
      const { setupTelegram } = await import("../setup.js");
      await setupTelegram(config.workspace);
      return 0;
    },
  },
});
