import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

const HIDDEN_SLASH_COMMANDS = new Set(["scoped-models"]);
const MODEL_SELECTION_HINT = "Use /model to change models in Shrimpy.";

interface InteractiveModeModelSelectionInternals {
  createBaseAutocompleteProvider?(): AutocompleteProvider;
  setupKeyHandlers?(): void;
  showModelsSelector?(): void | Promise<void>;
  showStatus(message: string): void;
  defaultEditor?: {
    onAction(action: string, handler: () => void): void;
  };
}

export function installShrimpyModelSelectionGuard(
  interactive: InteractiveMode,
): void {
  const mode = interactive as unknown as InteractiveModeModelSelectionInternals;

  const originalCreateBaseAutocompleteProvider =
    mode.createBaseAutocompleteProvider?.bind(mode);
  if (originalCreateBaseAutocompleteProvider) {
    mode.createBaseAutocompleteProvider = () =>
      hideScopedModelsAutocomplete(originalCreateBaseAutocompleteProvider());
  }

  mode.showModelsSelector = () => {
    mode.showStatus(MODEL_SELECTION_HINT);
  };

  const originalSetupKeyHandlers = mode.setupKeyHandlers?.bind(mode);
  if (originalSetupKeyHandlers) {
    mode.setupKeyHandlers = () => {
      originalSetupKeyHandlers();
      disableModelCycling(mode);
    };
  }

  disableModelCycling(mode);
}

export function hideScopedModelsAutocomplete(
  provider: AutocompleteProvider,
): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const suggestions = await provider.getSuggestions(
        lines,
        cursorLine,
        cursorCol,
        options,
      );
      return filterScopedModelsAutocompleteSuggestions(suggestions);
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return provider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return provider.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        false;
    },
  };
}

export function filterScopedModelsAutocompleteSuggestions(
  suggestions: AutocompleteSuggestions | null,
): AutocompleteSuggestions | null {
  if (!suggestions || !isSlashCommandPrefix(suggestions.prefix)) {
    return suggestions;
  }

  const items = suggestions.items.filter((item) =>
    !HIDDEN_SLASH_COMMANDS.has(item.value)
      && !HIDDEN_SLASH_COMMANDS.has(item.label)
  );

  return items.length > 0 ? { ...suggestions, items } : null;
}

function isSlashCommandPrefix(prefix: string): boolean {
  return prefix.startsWith("/") && !/\s/u.test(prefix);
}

function disableModelCycling(mode: InteractiveModeModelSelectionInternals): void {
  mode.defaultEditor?.onAction("app.model.cycleForward", () => {
    mode.showStatus(MODEL_SELECTION_HINT);
  });
  mode.defaultEditor?.onAction("app.model.cycleBackward", () => {
    mode.showStatus(MODEL_SELECTION_HINT);
  });
}
