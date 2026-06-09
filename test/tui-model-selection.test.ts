import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { initTheme } from "../dist/app/pi-internals.js";
import {
  filterScopedModelsAutocompleteSuggestions,
  hideScopedModelsAutocomplete,
  installShrimpyModelSelectionGuard,
  orderModelItemsByFavorites,
  toggleModelFavoriteId,
} from "../dist/tui/shrimpy-model-selection.js";

initTheme("dark", false);

test("Shrimpy autocomplete hides Pi scoped models command", () => {
  const filtered = filterScopedModelsAutocompleteSuggestions({
    prefix: "/sc",
    items: [
      {
        value: "scoped-models",
        label: "scoped-models",
        description: "Enable/disable models for Ctrl+P cycling",
      },
      {
        value: "share",
        label: "share",
        description: "Share session externally",
      },
      {
        value: "settings",
        label: "settings",
      },
    ],
  });

  assert.deepEqual(filtered, {
    prefix: "/sc",
    items: [
      {
        value: "settings",
        label: "settings",
      },
    ],
  });

  assert.equal(
    filterScopedModelsAutocompleteSuggestions({
      prefix: "/scoped-models ",
      items: [
        {
          value: "anything",
          label: "anything",
        },
      ],
    })?.items.length,
    1,
  );
});

test("Shrimpy autocomplete hides Pi share command", () => {
  const filtered = filterScopedModelsAutocompleteSuggestions({
    prefix: "/sh",
    items: [
      {
        value: "share",
        label: "share",
        description: "Share session externally",
      },
      {
        value: "shrimpy",
        label: "shrimpy",
      },
    ],
  });

  assert.deepEqual(filtered, {
    prefix: "/sh",
    items: [
      {
        value: "shrimpy",
        label: "shrimpy",
      },
    ],
  });
});

test("Shrimpy autocomplete returns null when only hidden slash commands would match", () => {
  assert.equal(
    filterScopedModelsAutocompleteSuggestions({
      prefix: "/scoped",
      items: [
        {
        value: "scoped-models",
        label: "scoped-models",
      },
      {
        value: "share",
        label: "share",
      },
    ],
  }),
    null,
  );
});

test("Shrimpy model selection guard wraps autocomplete and disables model cycling", async () => {
  const actions = new Map<string, () => void>();
  const statuses: string[] = [];
  let setupCalled = false;
  const baseProvider = autocompleteProvider({
    prefix: "/sc",
    items: [
      {
        value: "scoped-models",
        label: "scoped-models",
      },
      {
        value: "settings",
        label: "settings",
      },
    ],
  });
  const interactive = {
    createBaseAutocompleteProvider(): AutocompleteProvider {
      return baseProvider;
    },
    setupKeyHandlers(): void {
      setupCalled = true;
      actions.set("app.model.cycleForward", () => statuses.push("cycled"));
      actions.set("app.model.cycleBackward", () => statuses.push("cycled"));
    },
    showModelsSelector(): void {
      statuses.push("opened scoped selector");
    },
    showStatus(message: string): void {
      statuses.push(message);
    },
    defaultEditor: {
      onAction(action: string, handler: () => void): void {
        actions.set(action, handler);
      },
    },
  };

  installShrimpyModelSelectionGuard(interactive as never);

  const provider = interactive.createBaseAutocompleteProvider();
  const suggestions = await provider.getSuggestions(["/sc"], 0, 3, {
    signal: new AbortController().signal,
  });
  assert.deepEqual(suggestions?.items.map((item) => item.value), ["settings"]);

  await interactive.showModelsSelector();
  interactive.setupKeyHandlers();
  actions.get("app.model.cycleForward")?.();
  actions.get("app.model.cycleBackward")?.();

  assert.equal(setupCalled, true);
  assert.deepEqual(statuses, [
    "Use /model to change models in Shrimpy.",
    "Use /model to change models in Shrimpy.",
    "Use /model to change models in Shrimpy.",
  ]);
});

test("Shrimpy model favorites toggle to the top of ordered model items", () => {
  const models = [
    modelItem("openai", "gpt-5"),
    modelItem("anthropic", "claude-sonnet-4-5"),
    modelItem("openai", "gpt-4o"),
  ];

  assert.deepEqual(toggleModelFavoriteId([], "openai/gpt-4o"), [
    "openai/gpt-4o",
  ]);
  assert.deepEqual(
    toggleModelFavoriteId(["openai/gpt-4o"], "openai/gpt-4o"),
    [],
  );
  assert.deepEqual(
    orderModelItemsByFavorites(models, ["openai/gpt-4o"]).map(
      (item) => `${item.provider}/${item.id}`,
    ),
    [
      "openai/gpt-4o",
      "openai/gpt-5",
      "anthropic/claude-sonnet-4-5",
    ],
  );
});

test("Shrimpy model selector space toggles a persisted favorite", () => {
  const root = mkdtempSync(join(tmpdir(), "shrimpy-model-favorites-"));
  const configPath = join(root, "config", "shrimpy.json");
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({ tui: { modelFavorites: ["openai/gpt-4o"] } }, null, 2)
      + "\n",
    "utf-8",
  );

  let selector: ReturnType<typeof fakeModelSelector> | undefined;
  const statuses: string[] = [];
  let renderRequested = false;
  const interactive = {
    showSelector(create: (done: () => void) => { component: unknown; focus: unknown }) {
      const view = create(() => {});
      selector = view.component as ReturnType<typeof fakeModelSelector>;
    },
    showModelSelector(): void {
      this.showSelector(() => {
        const component = fakeModelSelector();
        return { component, focus: component };
      });
    },
    showStatus(message: string): void {
      statuses.push(message);
    },
    showError(message: string): void {
      statuses.push(`error: ${message}`);
    },
    ui: {
      requestRender(): void {
        renderRequested = true;
      },
    },
  };
  const runtime = {
    paths: { workspace: root, primaryConfigPath: configPath },
    config: { tui: { modelFavorites: ["openai/gpt-4o"] } },
  };

  installShrimpyModelSelectionGuard(interactive as never, {
    runtime: runtime as never,
  });
  interactive.showModelSelector();

  assert.ok(selector);
  assert.deepEqual(modelIds(selector.activeModels), [
    "openai/gpt-4o",
    "openai/gpt-5",
    "anthropic/claude-sonnet-4-5",
  ]);

  selector.selectedIndex = 2;
  selector.handleInput(" ");

  assert.deepEqual(modelIds(selector.activeModels), [
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o",
    "openai/gpt-5",
  ]);
  assert.equal(selector.selectedIndex, 0);
  assert.equal(renderRequested, true);
  assert.deepEqual(statuses, [
    "Favorite model: anthropic/claude-sonnet-4-5",
  ]);

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  assert.deepEqual(config.tui.modelFavorites, [
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o",
  ]);
  assert.deepEqual(runtime.config.tui.modelFavorites, [
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o",
  ]);
});

test("hideScopedModelsAutocomplete delegates non-slash completion", async () => {
  let applyCalled = false;
  const provider = hideScopedModelsAutocomplete({
    async getSuggestions(): Promise<AutocompleteSuggestions> {
      return {
        prefix: "src/",
        items: [
          {
            value: "src/index.ts",
            label: "src/index.ts",
          },
        ],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      applyCalled = true;
      assert.equal(item.value, "src/index.ts");
      assert.equal(prefix, "src/");
      return { lines, cursorLine, cursorCol };
    },
  });

  const suggestions = await provider.getSuggestions(["src/"], 0, 4, {
    signal: new AbortController().signal,
  });
  assert.deepEqual(suggestions?.items.map((item) => item.value), ["src/index.ts"]);

  provider.applyCompletion(
    ["src/"],
    0,
    4,
    suggestions!.items[0]!,
    suggestions!.prefix,
  );
  assert.equal(applyCalled, true);
});

function autocompleteProvider(
  suggestions: AutocompleteSuggestions,
): AutocompleteProvider {
  return {
    async getSuggestions(): Promise<AutocompleteSuggestions> {
      return suggestions;
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  };
}

function modelItem(provider: string, id: string) {
  return {
    provider,
    id,
    model: {
      provider,
      id,
      name: id,
    },
  };
}

function modelIds(models: Array<{ provider: string; id: string }>): string[] {
  return models.map((model) => `${model.provider}/${model.id}`);
}

function fakeModelSelector() {
  const selector = {
    allModels: [
      modelItem("openai", "gpt-5"),
      modelItem("anthropic", "claude-sonnet-4-5"),
      modelItem("openai", "gpt-4o"),
    ],
    scopedModelItems: [],
    activeModels: [] as ReturnType<typeof modelItem>[],
    filteredModels: [] as ReturnType<typeof modelItem>[],
    selectedIndex: 0,
    currentModel: undefined,
    errorMessage: undefined,
    scope: "all" as const,
    listContainer: {
      children: [] as unknown[],
      clear(): void {
        this.children = [];
      },
      addChild(component: unknown): void {
        this.children.push(component);
      },
    },
    getSearchInput() {
      return { getValue: () => "" };
    },
    sortModels(models: ReturnType<typeof modelItem>[]) {
      return models;
    },
    filterModels(_query: string) {
      this.filteredModels = this.activeModels;
      this.updateList();
    },
    updateList() {
      this.listContainer.clear();
    },
    handleInput(_keyData: string) {},
    render() {
      return [];
    },
  };
  selector.activeModels = selector.allModels;
  selector.filteredModels = selector.activeModels;
  return selector;
}
