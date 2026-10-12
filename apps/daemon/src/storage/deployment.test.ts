import { describe, expect, it } from "vitest";

import { deploymentOf, DEPLOYMENT_VARIABLE } from "./deployment";

const declaring = (value: string) => ({ [DEPLOYMENT_VARIABLE]: value });

describe("what a daemon says it is deployed as", () => {
  it("is what it was told, where it was told", () => {
    expect(deploymentOf(declaring("docker"), false)).toBe("docker");
  });

  it("is a container where only the marker says so", () => {
    expect(deploymentOf({}, true)).toBe("container");
  });

  it("prefers its own claim to the marker, since the marker says less", () => {
    expect(deploymentOf(declaring("docker"), true)).toBe("docker");
  });

  /** Absence proves nothing, so nothing is claimed. */
  it("says nothing where neither says so", () => {
    expect(deploymentOf({}, false)).toBeUndefined();
    expect(deploymentOf(declaring("  "), false)).toBeUndefined();
  });
});
