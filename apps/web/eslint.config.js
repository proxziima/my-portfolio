import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Playwright's own output (a bundled HTML report), never source
  { ignores: ["playwright-report/", "test-results/"] },
  // the js-dos runtime, vendored minified as the reference ships it
  { ignores: ["public/js-dos/"] },
  ...nextJsConfig,
];
