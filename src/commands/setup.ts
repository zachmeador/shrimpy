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
    const { runSetupOnboarding } = await import("../setup/onboarding.js");
    await runSetupOnboarding(config.workspace);
    return 0;
  },
  commands: {
    init: async ({ config }) => {
      const { runSetupOnboarding } = await import("../setup/onboarding.js");
      await runSetupOnboarding(config.workspace);
      return 0;
    },
    telegram: async ({ config }) => {
      const { setupTelegram } = await import("../setup/telegram.js");
      await setupTelegram(config.workspace);
      return 0;
    },
  },
});
