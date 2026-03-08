import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: tsPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": "warn",
      "prettier/prettier": "warn",
    },
  },
];

export default config;
