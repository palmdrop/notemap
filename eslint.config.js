import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["docs/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Core carries @types/node for runtime types such as AbortSignal, so the
    // compiler will not stop an import of `fs`. This will. Core reaches the
    // outside world through ports only.
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "fs/*",
                "path",
                "os",
                "crypto",
                "http",
                "https",
                "net",
                "child_process",
                "worker_threads",
                "stream",
                "stream/*",
                "util",
                "events",
                "buffer",
                "process",
                "url",
                "timers",
                "timers/*",
              ],
              message:
                "core takes no runtime dependency; reach the world through a port.",
            },
          ],
        },
      ],
    },
  },
);
