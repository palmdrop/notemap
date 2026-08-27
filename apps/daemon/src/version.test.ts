import { describe, expect, it } from "vitest";

import { VERSION } from "./version";

describe("the daemon's version", () => {
  /** A bundled daemon carries the workspace version; anything else says so. */
  it("is a semver, or the sentinel a run that was never built gets", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-dev)?$/);
  });
});
