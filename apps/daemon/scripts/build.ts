import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { bundleUi } from "./bundle-ui.ts";
import { vendorSwaggerUi } from "./vendor-swagger.ts";

const entry = (name: string) =>
  fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url));

/** The workspace version. One number for the daemon, the app and the image. */
const version = (
  JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

vendorSwaggerUi();
bundleUi();

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
  define: { __NOTEMAP_VERSION__: JSON.stringify(version) },
  logLevel: "info",
});
