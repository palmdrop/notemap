import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

/** The workspace root, so one `.env` answers for every package that wants it. */
const envDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const daemon = `http://localhost:${env.NOTEMAP_PORT ?? "4747"}`;

  return {
    envDir,
    plugins: [
      tailwindcss(),
      sveltekit({
        alias: {
          $components: "./src/components",
        },
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        },
        adapter: adapter({ fallback: "index.html" }),
      }),
    ],
    server: {
      // In production the daemon serves this app from its own origin. Proxying
      // rather than calling it across origins keeps dev the same shape, which
      // is what lets the daemon send no CORS headers at all.
      proxy: {
        "/v1": daemon,
        "/log": daemon,
        "/docs": daemon,
      },
    },
  };
});
