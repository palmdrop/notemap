import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One port and one pool: two daemons at once would fight over both.
    fileParallelism: false,
    globalSetup: ["./src/harness/build.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
