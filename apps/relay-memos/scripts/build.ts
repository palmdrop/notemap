import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * The workspace packages are written for a bundler — extensionless relative
 * imports, directory index files — so `node src/main.ts` cannot resolve
 * `@notemap/relay`. Bundling keeps that confined to the app that has to run.
 */
await build({
  entryPoints: [fileURLToPath(new URL("../src/main.ts", import.meta.url))],
  outdir: fileURLToPath(new URL("../dist", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  external: ["node:*"],
  logLevel: "info",
});
