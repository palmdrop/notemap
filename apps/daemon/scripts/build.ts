import { build } from "esbuild";
import { fileURLToPath } from "node:url";

/**
 * The one build step in the repo, and it exists for a boring reason: the
 * workspace packages are written for a bundler — extensionless relative
 * imports, directory index files — so `node src/main.ts` cannot resolve
 * `@notemap/core` even though Node can strip the types. Bundling keeps that
 * confined to the app that has to actually run, rather than rewriting every
 * import in core and the adapters.
 *
 * Nothing is minified: a self-hosted daemon should be readable where it fails.
 */
await build({
  entryPoints: [fileURLToPath(new URL("../src/main.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/main.js", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  external: ["node:*"],
  logLevel: "info",
});
