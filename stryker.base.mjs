/**
 * What every package's mutation run shares. Stryker has no notion of a
 * workspace, so each package that is worth mutating names this and runs on its
 * own; `plugins` is spelt out because pnpm's node_modules gives the runner
 * nothing to discover.
 *
 * `StringLiteral` is left out: changing the wording of a message is not a
 * behaviour change, and a test that pins one says nothing about the code.
 * Static mutants — module-level code, which forces every test to run again —
 * are ignored rather than scored, because they cost most of the run.
 */
export const base = {
  packageManager: "pnpm",
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  reporters: ["clear-text", "progress", "html", "json"],
  // Test support is not the subject: a generator nothing but a test imports
  // would otherwise fill the report with mutants of its own.
  mutate: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/testing/**",
    "!src/**/arbitraries.ts",
  ],
  concurrency: 8,
  timeoutMS: 15_000,
  htmlReporter: { fileName: ".stryker-tmp/report.html" },
  jsonReporter: { fileName: ".stryker-tmp/report.json" },
  mutator: { excludedMutations: ["StringLiteral"] },
  ignoreStatic: true,
  /**
   * Even after a failed run: a sandbox left behind is a second copy of every
   * test file, which the package's own `vitest run` would then pick up.
   */
  cleanTempDir: "always",
};
