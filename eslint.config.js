import tseslint from "typescript-eslint";
import boundaries from "./lint/boundaries.js";

const tests = ["src/**/*.test.ts", "src/**/testing/**/*.ts"];

export default tseslint.config(
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      boundaries,
    },
    rules: {
      "boundaries/imports": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: "only-allowed-literals" },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  {
    // A client reaches a program by its name, and never works out a path to it.
    files: ["src/**/*.ts"],
    ignores: ["src/gateway/**", "src/contracts/gateway/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/contracts/gateway/node.ts"],
              importNames: ["wayInSocket", "waysDirectory"],
              message: "Only the gateway and contracts/gateway know where a way in is. Reach a program by its name with reachProgram.",
            },
          ],
        },
      ],
    },
  },
  {
    files: tests,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
  {
    files: ["lint/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
    plugins: {
      boundaries,
    },
  },
);
