// Pi does not publicly export this display-name table. Setup uses it only to
// present provider labels; a missing table would degrade labels, not behavior.
export {
  BUILT_IN_PROVIDER_DISPLAY_NAMES,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/provider-display-names.js";

// Pi publicly exports initTheme and Theme, but not the registry and automatic
// theme-resolution helpers required before InteractiveMode constructs its UI.
export {
  detectTerminalBackgroundFromEnv,
  loadThemeFromPath,
  resolveThemeSetting,
  setRegisteredThemes,
  theme,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
