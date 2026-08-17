import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

const FRAMEWORKS = {
  group: ["svelte", "svelte/*", "react", "react-dom", "vue"],
  message:
    "the client imports no UI framework; the shell adapts its observables.",
};

const SUBJECTS = {
  name: "rxjs",
  importNames: ["Subject", "BehaviorSubject", "ReplaySubject", "AsyncSubject"],
  message:
    "a subject can be ended; keep it inside observable/ and pass an Observable.",
};

export default tseslint.config(
  // Everything generated, none of it ours to lint: the daemon's esbuild bundle
  // and what its build copies into `public/`, the app's vite output and
  // SvelteKit's `sync` glue, and the OpenAPI document as types.
  // `.claude/` holds agent scratch, including worktrees that are whole copies
  // of this repo — linting one lints everything twice.
  {
    ignores: [
      "docs/",
      ".claude/",
      "**/dist/",
      "**/build/",
      "**/.svelte-kit/",
      "**/generated.d.ts",
      "apps/daemon/public/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    // Omitting fields by destructuring rest is how a projection stays
    // exhaustive; the discarded bindings are the point, not an oversight.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    // The shell writes its components in TypeScript, which the Svelte parser
    // only reads when it is handed the TypeScript one for the script block.
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // What typescript-eslint already turns off for `.ts`: the compiler knows
      // the DOM lib, and `svelte-check` is what runs it over a component.
      "no-undef": "off",

      // `resolve()` exists for a base path, and the shell is served from the
      // origin root — two of its links leave SvelteKit for the daemon entirely.
      "svelte/no-navigation-without-resolve": "off",
    },
  },
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
  {
    // The shared client is written once and drawn by every shell, so a UI
    // framework reaching it would drag the state logic back into one platform.
    // A subject can be ended, and an ended surface never emits again: they stay
    // inside `observable/`, which hands out observables that have no such method.
    files: ["packages/client/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [FRAMEWORKS], paths: [SUBJECTS] },
      ],
    },
  },
  {
    files: ["packages/client/src/observable/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [FRAMEWORKS] }],
    },
  },
);
