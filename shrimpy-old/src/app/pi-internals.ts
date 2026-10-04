// Pi publicly exports initTheme and Theme, but not the registry and automatic
// theme-resolution helpers required before InteractiveMode constructs its UI.
export {
  detectTerminalBackgroundFromEnv,
  loadThemeFromPath,
  resolveThemeSetting,
  setRegisteredThemes,
  theme,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
