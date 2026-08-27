declare const __NOTEMAP_VERSION__: string | undefined;

/**
 * The workspace version, replaced by the bundler. A test run is not a build and
 * `node src/main.ts` is not either, so both see the sentinel rather than a
 * number that would be a claim about a release nobody cut.
 */
export const VERSION =
  typeof __NOTEMAP_VERSION__ === "string" ? __NOTEMAP_VERSION__ : "0.0.0-dev";
