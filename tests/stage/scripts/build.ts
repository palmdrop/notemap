import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The workspace packages are written for a bundler, so neither fake nor the
 * seed can run as `node src/….ts`. One file each, and no `node_modules` in the
 * images they go into.
 */
await build({
  entryPoints: {
    arena: at("../src/arena/main.ts"),
    pages: at("../src/pages/main.ts"),
    seed: at("../../../scripts/seed.ts"),
  },
  outdir: at("../dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  packages: "bundle",
  external: ["node:*"],
  logLevel: "info",
});
