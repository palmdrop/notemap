import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { PUBLIC_DIR } from "./paths";

/**
 * The tests import sources, the daemon runs a flat bundle, and a path relative
 * to a module resolves differently in the two unless it is written from the
 * depth `dist/main.js` sits at. Nothing else here can see that difference.
 */
describe("the public directory", () => {
  it("is resolved from the depth the bundle occupies", () => {
    const manifest = readFileSync(
      join(dirname(PUBLIC_DIR), "package.json"),
      "utf8",
    );

    expect(JSON.parse(manifest).name).toBe("@notemap/daemon");
  });

  it("holds the pages the daemon serves", () => {
    expect(readFileSync(join(PUBLIC_DIR, "index.html"), "utf8")).toContain(
      "/v1/captures",
    );
    expect(readFileSync(join(PUBLIC_DIR, "docs.html"), "utf8")).toContain(
      "/v1/openapi.json",
    );
  });
});
