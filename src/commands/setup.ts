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
    const {
      runSetupOnboarding,
      setupOnboardingExitCode,
    } = await import("../setup/onboarding.js");
    return setupOnboardingExitCode(await runSetupOnboarding(config.workspace));
  },
  commands: {
    telegram: async ({ config }) => {
      const { setupTelegram } = await import("../setup/telegram.js");
      await setupTelegram(config.workspace);
      return 0;
    },
  },
});
