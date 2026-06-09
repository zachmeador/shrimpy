import { existsSync } from "node:fs";
import { modelsAreEqual, type Api, type Model } from "@earendil-works/pi-ai";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import {
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type Component,
  fuzzyFilter,
  Key,
  matchesKey,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import type { AppRuntime } from "../app/runtime.js";
import {
  formatModelRef,
  type ModelRef,
} from "../config/model.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { isRecord } from "../util/record.js";

const HIDDEN_SLASH_COMMANDS = new Set(["scoped-models", "share"]);
const MODEL_SELECTION_HINT = "Use /model to change models in Shrimpy.";
const MODEL_FAVORITES_TUI_KEY = "modelFavorites";

type ShowSelectorFactory = (done: () => void) => {
  component: Component;
  focus: Component;
};

interface InteractiveModeModelSelectionInternals {
  createBaseAutocompleteProvider?(): AutocompleteProvider;
  setupKeyHandlers?(): void;
  showSelector?(create: ShowSelectorFactory): void;
  showModelSelector?(initialSearchInput?: string): void | Promise<void>;
  showModelsSelector?(): void | Promise<void>;
  showStatus(message: string): void;
  showError?(message: string): void;
  ui?: {
    requestRender(): void;
  };
  defaultEditor?: {
    onAction(action: string, handler: () => void): void;
  };
}

interface ShrimpyModelSelectionGuardOptions {
  runtime?: AppRuntime;
}

export function installShrimpyModelSelectionGuard(
  interactive: InteractiveMode,
  options: ShrimpyModelSelectionGuardOptions = {},
): void {
  const mode = interactive as unknown as InteractiveModeModelSelectionInternals;
  installFavoriteAwareModelSelector(mode, options);

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

interface ModelSelectorItem {
  provider: string;
  id: string;
  model: Model<Api>;
}

interface SearchInputLike {
  getValue(): string;
}

interface ModelSelectorInternals extends Component {
  allModels: ModelSelectorItem[];
  scopedModelItems: ModelSelectorItem[];
  activeModels: ModelSelectorItem[];
  filteredModels: ModelSelectorItem[];
  selectedIndex: number;
  currentModel?: Model<Api>;
  errorMessage?: string;
  scope: "all" | "scoped";
  listContainer: {
    clear(): void;
    addChild(component: Component): void;
  };
  getSearchInput?(): SearchInputLike;
  searchInput?: SearchInputLike;
  sortModels(models: ModelSelectorItem[]): ModelSelectorItem[];
  filterModels(query: string): void;
  updateList(): void;
  handleInput(keyData: string): void;
}

interface FavoriteModelSelectorHooks {
  getFavoriteIds(): string[];
  setFavoriteIds(favoriteIds: string[]): void;
  requestRender(): void;
  showStatus(message: string): void;
  showError?(message: string): void;
}

type ModelFavoriteRef = ModelRef;

export function modelFavoriteId(model: ModelFavoriteRef): string {
  return formatModelRef(model);
}

export function toggleModelFavoriteId(
  favoriteIds: readonly string[],
  modelId: string,
): string[] {
  const normalized = normalizeModelFavoriteIds(favoriteIds);
  if (normalized.includes(modelId)) {
    return normalized.filter((id) => id !== modelId);
  }
  return [modelId, ...normalized];
}

export function orderModelItemsByFavorites<T extends ModelFavoriteRef>(
  items: readonly T[],
  favoriteIds: readonly string[],
): T[] {
  const favoriteRank = new Map(
    normalizeModelFavoriteIds(favoriteIds).map((id, index) => [id, index]),
  );

  return [...items].sort((a, b) => {
    const aRank = favoriteRank.get(modelFavoriteId(a));
    const bRank = favoriteRank.get(modelFavoriteId(b));

    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return 0;
  });
}

export function normalizeModelFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function installFavoriteAwareModelSelector(
  mode: InteractiveModeModelSelectionInternals,
  options: ShrimpyModelSelectionGuardOptions,
): void {
  const originalShowModelSelector = mode.showModelSelector?.bind(mode);
  if (!originalShowModelSelector || !mode.showSelector) return;

  let favoriteIds = readModelFavoriteIds(options.runtime);

  mode.showModelSelector = (initialSearchInput?: string) => {
    const previousShowSelector = mode.showSelector;
    if (!previousShowSelector) {
      return originalShowModelSelector(initialSearchInput);
    }

    mode.showSelector = (create) => {
      previousShowSelector.call(mode, (done) => {
        const selectorView = create(done);
        if (isModelSelector(selectorView.component)) {
          decorateModelSelectorWithFavorites(selectorView.component, {
            getFavoriteIds: () => favoriteIds,
            setFavoriteIds: (nextFavoriteIds) => {
              favoriteIds = normalizeModelFavoriteIds(nextFavoriteIds);
              persistModelFavoriteIds(options.runtime, favoriteIds);
            },
            requestRender: () => mode.ui?.requestRender(),
            showStatus: (message) => mode.showStatus(message),
            showError: mode.showError
              ? (message) => mode.showError?.(message)
              : undefined,
          });
        }
        return selectorView;
      });
    };

    let shouldRestore = true;
    try {
      const result = originalShowModelSelector(initialSearchInput);
      if (isPromiseLike(result)) {
        shouldRestore = false;
        return result.finally(() => {
          mode.showSelector = previousShowSelector;
        });
      }
      return result;
    } finally {
      if (shouldRestore) {
        mode.showSelector = previousShowSelector;
      }
    }
  };
}

function decorateModelSelectorWithFavorites(
  selector: ModelSelectorInternals,
  hooks: FavoriteModelSelectorHooks,
): void {
  const marker = selector as ModelSelectorInternals & {
    __shrimpyModelFavoritesInstalled?: boolean;
  };
  if (marker.__shrimpyModelFavoritesInstalled) return;
  marker.__shrimpyModelFavoritesInstalled = true;

  const originalSortModels = selector.sortModels.bind(selector);
  const originalHandleInput = selector.handleInput.bind(selector);

  selector.sortModels = (models) =>
    orderModelItemsByFavorites(originalSortModels(models), hooks.getFavoriteIds());

  selector.filterModels = (query) => {
    selector.filteredModels = query
      ? orderModelItemsByFavorites(
        fuzzyFilter(
          selector.activeModels,
          query,
          ({ id, provider }) =>
            `${id} ${provider} ${provider}/${id} ${provider} ${id}`,
        ),
        hooks.getFavoriteIds(),
      )
      : orderModelItemsByFavorites(selector.activeModels, hooks.getFavoriteIds());
    selector.selectedIndex = Math.min(
      selector.selectedIndex,
      Math.max(0, selector.filteredModels.length - 1),
    );
    selector.updateList();
  };

  selector.updateList = () =>
    renderFavoriteModelList(selector, hooks.getFavoriteIds());

  selector.handleInput = (keyData) => {
    if (isSpaceKey(keyData)) {
      toggleSelectedModelFavorite(selector, hooks);
      return;
    }
    originalHandleInput(keyData);
  };

  if (selector.activeModels.length > 0 || selector.filteredModels.length > 0) {
    refreshFavoriteModelSelector(selector, hooks.getFavoriteIds());
  }
}

function toggleSelectedModelFavorite(
  selector: ModelSelectorInternals,
  hooks: FavoriteModelSelectorHooks,
): void {
  const selected = selector.filteredModels[selector.selectedIndex];
  if (!selected) return;

  const selectedId = modelFavoriteId(selected);
  const nextFavoriteIds = toggleModelFavoriteId(
    hooks.getFavoriteIds(),
    selectedId,
  );

  try {
    hooks.setFavoriteIds(nextFavoriteIds);
  } catch (error) {
    hooks.showError?.(error instanceof Error ? error.message : String(error));
    return;
  }

  refreshFavoriteModelSelector(selector, nextFavoriteIds, selectedId);
  const isFavorite = nextFavoriteIds.includes(selectedId);
  hooks.showStatus(
    isFavorite
      ? `Favorite model: ${selectedId}`
      : `Unfavorite model: ${selectedId}`,
  );
  hooks.requestRender();
}

function refreshFavoriteModelSelector(
  selector: ModelSelectorInternals,
  favoriteIds: readonly string[],
  selectedId?: string,
): void {
  selector.allModels = orderModelItemsByFavorites(selector.allModels, favoriteIds);
  selector.scopedModelItems = orderModelItemsByFavorites(
    selector.scopedModelItems,
    favoriteIds,
  );
  selector.activeModels =
    selector.scope === "scoped" ? selector.scopedModelItems : selector.allModels;
  selector.filterModels(getModelSelectorSearchValue(selector));

  if (selectedId) {
    const nextIndex = selector.filteredModels.findIndex(
      (item) => modelFavoriteId(item) === selectedId,
    );
    if (nextIndex >= 0) {
      selector.selectedIndex = nextIndex;
      selector.updateList();
    }
  }
}

function renderFavoriteModelList(
  selector: ModelSelectorInternals,
  favoriteIds: readonly string[],
): void {
  selector.listContainer.clear();
  const favorites = new Set(normalizeModelFavoriteIds(favoriteIds));
  const maxVisible = 10;
  const startIndex = Math.max(
    0,
    Math.min(
      selector.selectedIndex - Math.floor(maxVisible / 2),
      selector.filteredModels.length - maxVisible,
    ),
  );
  const endIndex = Math.min(startIndex + maxVisible, selector.filteredModels.length);

  for (let i = startIndex; i < endIndex; i++) {
    const item = selector.filteredModels[i];
    if (!item) continue;

    const isSelected = i === selector.selectedIndex;
    const isCurrent = modelsAreEqual(selector.currentModel, item.model);
    const favoriteMarker = favorites.has(modelFavoriteId(item))
      ? theme.fg("warning", "* ")
      : "  ";
    const providerBadge = theme.fg("muted", `[${item.provider}]`);
    const checkmark = isCurrent ? theme.fg("success", " \u2713") : "";

    if (isSelected) {
      const prefix = theme.fg("accent", "\u2192 ");
      const modelText = `${favoriteMarker}${theme.fg("accent", item.id)}`;
      selector.listContainer.addChild(
        new Text(`${prefix}${modelText} ${providerBadge}${checkmark}`, 0, 0),
      );
    } else {
      selector.listContainer.addChild(
        new Text(`  ${favoriteMarker}${item.id} ${providerBadge}${checkmark}`, 0, 0),
      );
    }
  }

  if (startIndex > 0 || endIndex < selector.filteredModels.length) {
    selector.listContainer.addChild(
      new Text(
        theme.fg(
          "muted",
          `  (${selector.selectedIndex + 1}/${selector.filteredModels.length})`,
        ),
        0,
        0,
      ),
    );
  }

  if (selector.errorMessage) {
    for (const line of selector.errorMessage.split("\n")) {
      selector.listContainer.addChild(new Text(theme.fg("error", line), 0, 0));
    }
  } else if (selector.filteredModels.length === 0) {
    selector.listContainer.addChild(
      new Text(theme.fg("muted", "  No matching models"), 0, 0),
    );
  } else {
    const selected = selector.filteredModels[selector.selectedIndex];
    if (!selected) return;
    const action = favorites.has(modelFavoriteId(selected))
      ? "unfavorite"
      : "favorite";
    selector.listContainer.addChild(new Spacer(1));
    selector.listContainer.addChild(
      new Text(
        theme.fg(
          "muted",
          `  Model Name: ${selected.model.name || selected.id} - Space to ${action}`,
        ),
        0,
        0,
      ),
    );
  }
}

function isModelSelector(component: Component): component is ModelSelectorInternals {
  const candidate = component as unknown as Record<string, unknown>;
  return Array.isArray(candidate.allModels)
    && Array.isArray(candidate.scopedModelItems)
    && Array.isArray(candidate.activeModels)
    && Array.isArray(candidate.filteredModels)
    && typeof candidate.sortModels === "function"
    && typeof candidate.filterModels === "function"
    && typeof candidate.updateList === "function"
    && typeof candidate.handleInput === "function"
    && isRecord(candidate.listContainer);
}

function isSpaceKey(keyData: string): boolean {
  return keyData === " " || matchesKey(keyData, Key.space);
}

function getModelSelectorSearchValue(selector: ModelSelectorInternals): string {
  return selector.getSearchInput?.().getValue()
    ?? selector.searchInput?.getValue()
    ?? "";
}

function readModelFavoriteIds(runtime?: AppRuntime): string[] {
  if (!runtime) return [];
  return normalizeModelFavoriteIds(
    asRecord(runtime.config.tui)[MODEL_FAVORITES_TUI_KEY],
  );
}

function persistModelFavoriteIds(
  runtime: AppRuntime | undefined,
  favoriteIds: readonly string[],
): void {
  if (!runtime) return;

  const ids = normalizeModelFavoriteIds(favoriteIds);
  const configPath = runtime.paths.primaryConfigPath;
  const raw = existsSync(configPath) ? readRawConfig(configPath) : {};
  raw.tui = {
    ...asRecord(raw.tui),
    [MODEL_FAVORITES_TUI_KEY]: ids,
  };
  writeJsonFileAtomic(configPath, raw);

  runtime.config.tui = {
    ...asRecord(runtime.config.tui),
    [MODEL_FAVORITES_TUI_KEY]: ids,
  };
}

function readRawConfig(path: string): Record<string, unknown> {
  const raw = readJsonFileStrict(
    path,
    (parsed) => parsed as unknown,
  );
  if (!isRecord(raw)) {
    throw new Error(`config must be a JSON object: ${path}`);
  }
  return raw;
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return isRecord(value) && typeof value.then === "function";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
