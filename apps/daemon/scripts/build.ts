import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const entry = (name: string) =>
  fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url));

/**
 * The workspace packages are written for a bundler — extensionless relative
 * imports, directory index files — so `node src/main.ts` cannot resolve
 * `@notemap/core`. Bundling keeps that confined to the app that has to run.
 */
await build({
  entryPoints: [entry("main"), entry("write-openapi")],
  outdir: fileURLToPath(new URL("../dist", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  external: ["node:*"],
  logLevel: "info",
});
