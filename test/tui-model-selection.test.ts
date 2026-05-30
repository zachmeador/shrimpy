import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import {
  filterScopedModelsAutocompleteSuggestions,
  hideScopedModelsAutocomplete,
  installShrimpyModelSelectionGuard,
} from "../dist/tui/shrimpy-model-selection.js";

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

test("Shrimpy autocomplete returns null when only scoped models would match", () => {
  assert.equal(
    filterScopedModelsAutocompleteSuggestions({
      prefix: "/scoped",
      items: [
        {
          value: "scoped-models",
          label: "scoped-models",
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
